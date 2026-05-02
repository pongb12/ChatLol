const admin = require('firebase-admin');
const Config = require('./config');
const Logger = require('./logger');

class FirebaseManager {
    constructor() {
        this.db = null;
        this.FieldValue = admin.firestore.FieldValue;
        this.init();
    }

    init() {
        try {
            let serviceAccount;
            try {
                serviceAccount = JSON.parse(Config.FIREBASE_SERVICE_ACCOUNT);
            } catch (e) {
                Logger.error('❌ FIREBASE_SERVICE_ACCOUNT không phải JSON hợp lệ');
                throw e;
            }

            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: Config.FIREBASE_PROJECT_ID
            });

            this.db = admin.firestore();
            Logger.success('✅ Firebase connected');
        } catch (error) {
            Logger.error('❌ Firebase init failed:', error.message);
            throw error;
        }
    }

    /* ================= USERS ================= */
    async getUser(userId) {
        const doc = await this.db.collection('users').doc(userId).get();
        return doc.exists ? doc.data() : null;
    }

    async createUser(userId, data) {
        await this.db.collection('users').doc(userId).set({
            ...data,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    async updateUser(userId, data) {
        await this.db.collection('users').doc(userId).update(data);
    }

    async deleteUser(userId) {
        // Xóa cả 2 subcollection history trước
        const batch = this.db.batch();

        const history = await this.db
            .collection('users').doc(userId)
            .collection('history').get();
        history.docs.forEach(doc => batch.delete(doc.ref));

        const historyPrivate = await this.db
            .collection('users').doc(userId)
            .collection('historyprivate').get();
        historyPrivate.docs.forEach(doc => batch.delete(doc.ref));

        await batch.commit();

        // Xóa user doc
        await this.db.collection('users').doc(userId).delete();
    }

    /* ================= HISTORY (public) ================= */
    async addHistory(userId, messageId, data) {
        const ttl = new Date();
        ttl.setDate(ttl.getDate() + Config.HISTORY_DAYS);

        await this.db.collection('users').doc(userId)
            .collection('history').doc(messageId).set({
                ...data,
                ttl: admin.firestore.Timestamp.fromDate(ttl),
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
    }

    async getHistory(userId, limit = 20) {
        const snapshot = await this.db.collection('users')
            .doc(userId)
            .collection('history')
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .get();

        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async clearHistory(userId) {
        const history = await this.db.collection('users')
            .doc(userId).collection('history').get();
        const batch = this.db.batch();
        history.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }

    /* ================= HISTORY PRIVATE ================= */
    // Lưu lịch sử private chat — không công khai cho user
    async addPrivateHistory(userId, messageId, data) {
        const ttl = new Date();
        ttl.setDate(ttl.getDate() + Config.HISTORY_DAYS);

        await this.db.collection('users').doc(userId)
            .collection('historyprivate').doc(messageId).set({
                ...data,
                ttl: admin.firestore.Timestamp.fromDate(ttl),
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
    }

    async getPrivateHistory(userId, limit = 50) {
        const snapshot = await this.db.collection('users')
            .doc(userId)
            .collection('historyprivate')
            .orderBy('timestamp', 'desc')
            .limit(limit)
            .get();

        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    async clearPrivateHistory(userId) {
        const history = await this.db.collection('users')
            .doc(userId).collection('historyprivate').get();
        const batch = this.db.batch();
        history.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }

    /* ================= QUOTA ================= */
    async resetQuota(userId) {
        await this.db.collection('users').doc(userId).update({
            'quota.instant.dailyRequests': 0,
            'quota.instant.lastReset': admin.firestore.FieldValue.serverTimestamp(),
            'quota.thinking.dailyRequests': 0,
            'quota.thinking.lastReset': admin.firestore.FieldValue.serverTimestamp()
        });
    }

    async resetAllQuotas() {
        const users = await this.db.collection('users').get();
        const batch = this.db.batch();

        users.docs.forEach(doc => {
            batch.update(doc.ref, {
                'quota.instant.dailyRequests': 0,
                'quota.instant.lastReset': admin.firestore.FieldValue.serverTimestamp(),
                'quota.thinking.dailyRequests': 0,
                'quota.thinking.lastReset': admin.firestore.FieldValue.serverTimestamp()
            });
        });

        await batch.commit();
        Logger.success(`Reset quota for ${users.size} users`);
    }

    /* ================= BANNED ================= */
    async isBanned(userId) {
        const doc = await this.db.collection('banned').doc(userId).get();
        if (!doc.exists) return false;

        const data = doc.data();
        if (!data.isActive) return false;
        if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
            await this.db.collection('banned').doc(userId).update({ isActive: false });
            return false;
        }
        return true;
    }

    async banUser(userId, data) {
        await this.db.collection('banned').doc(userId).set({
            ...data,
            bannedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    async unbanUser(userId) {
        await this.db.collection('banned').doc(userId).update({ isActive: false });
    }

    /* ================= PRIVATE CHATS ================= */
    async getPrivateChat(userId) {
        const doc = await this.db.collection('privateChats').doc(userId).get();
        return doc.exists ? doc.data() : null;
    }

    async createPrivateChat(userId, data) {
        const expiresAt = new Date();
        expiresAt.setTime(expiresAt.getTime() + Config.PRIVATE_CHAT_TIMEOUT);

        await this.db.collection('privateChats').doc(userId).set({
            ...data,
            expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    async updatePrivateChat(userId, data) {
        await this.db.collection('privateChats').doc(userId).update(data);
    }

    async deletePrivateChat(userId) {
        await this.db.collection('privateChats').doc(userId).delete();
    }

    /* ================= INACTIVE USERS ================= */
    async getInactiveUsers(days) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        const snapshot = await this.db.collection('users')
            .where('lastActive', '<', admin.firestore.Timestamp.fromDate(cutoff))
            .get();

        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    /* ================= CONFIG ================= */
    async getConfig() {
        const doc = await this.db.collection('config').doc('botConfig').get();
        return doc.exists ? doc.data() : null;
    }

    async setConfig(data) {
        await this.db.collection('config').doc('botConfig').set(data);
    }
}

module.exports = new FirebaseManager();
