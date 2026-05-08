const admin = require('firebase-admin');
const Config = require('./config');
const Logger = require('./logger');

class FirebaseManager {
    constructor() {
        this.db = null;
        this.init();
    }

    init() {
        try {
            const serviceAccount = JSON.parse(Config.FIREBASE_SERVICE_ACCOUNT);
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

    /* ─────────────────────────────────────────
       GLOBAL USERS  (users_global/{userId})
    ───────────────────────────────────────── */
    async getUser(userId) {
        const doc = await this.db.collection('users_global').doc(userId).get();
        return doc.exists ? doc.data() : null;
    }

    async createUser(userId, data) {
        await this.db.collection('users_global').doc(userId).set({
            ...data,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    async updateUser(userId, data) {
        await this.db.collection('users_global').doc(userId).update(data);
    }

    async deleteUser(userId) {
        const batch = this.db.batch();
        for (const sub of ['history', 'historyprivate']) {
            const snap = await this.db.collection('users_global').doc(userId).collection(sub).get();
            snap.docs.forEach(d => batch.delete(d.ref));
        }
        await batch.commit();
        await this.db.collection('users_global').doc(userId).delete();
    }

    async getInactiveUsers(days) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const snap = await this.db.collection('users_global')
            .where('lastActive', '<', admin.firestore.Timestamp.fromDate(cutoff)).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    /* ─────────────────────────────────────────
       GLOBAL HISTORY  (users_global/{uid}/history)
    ───────────────────────────────────────── */
    async addHistory(userId, data) {
        const ttl = new Date(); ttl.setDate(ttl.getDate() + Config.HISTORY_DAYS);
        await this.db.collection('users_global').doc(userId)
            .collection('history').doc(`qa_${Date.now()}`).set({
                question:  (data.question || '').slice(0, 500),
                answer:    (data.answer   || '').slice(0, 1500),
                model:     data.model || 'instant',
                ttl:       admin.firestore.Timestamp.fromDate(ttl),
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
    }

    async getHistory(userId, limit = 50) {
        const snap = await this.db.collection('users_global').doc(userId)
            .collection('history').orderBy('timestamp', 'desc').limit(limit).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    async clearHistory(userId) {
        const snap = await this.db.collection('users_global').doc(userId).collection('history').get();
        const batch = this.db.batch();
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
    }

    /* ─────────────────────────────────────────
       GLOBAL PRIVATE HISTORY
    ───────────────────────────────────────── */
    async addPrivateHistory(userId, data) {
        const ttl = new Date(); ttl.setDate(ttl.getDate() + Config.HISTORY_DAYS);
        await this.db.collection('users_global').doc(userId)
            .collection('historyprivate').doc(`qa_${Date.now()}`).set({
                question:  (data.question || '').slice(0, 500),
                answer:    (data.answer   || '').slice(0, 1500),
                model:     data.model || 'instant',
                ttl:       admin.firestore.Timestamp.fromDate(ttl),
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
    }

    async getPrivateHistory(userId, limit = 50) {
        const snap = await this.db.collection('users_global').doc(userId)
            .collection('historyprivate').orderBy('timestamp', 'desc').limit(limit).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    async clearPrivateHistory(userId) {
        const snap = await this.db.collection('users_global').doc(userId).collection('historyprivate').get();
        const batch = this.db.batch();
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
    }

    /* ─────────────────────────────────────────
       SERVER AUTH  (servers/{serverId})
    ───────────────────────────────────────── */
    async isServerAuthorized(serverId) {
        if (Config.isHomeServer(serverId)) return true;
        try {
            const doc = await this.db.collection('servers').doc(serverId).get();
            return doc.exists && doc.data()?.acpted === true;
        } catch { return false; }
    }

    async acptServer(serverId, data) {
        await this.db.collection('servers').doc(serverId).set({
            ...data,
            acpted: true,
            acptedAt:      admin.firestore.FieldValue.serverTimestamp(),
            totalRequests: admin.firestore.FieldValue.increment(0) // init if not exists
        }, { merge: true });
    }

    async getServer(serverId) {
        const doc = await this.db.collection('servers').doc(serverId).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    }

    async getAllServers() {
        const snap = await this.db.collection('servers').where('acpted', '==', true).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    async incrementServerRequests(serverId) {
        try {
            await this.db.collection('servers').doc(serverId).update({
                totalRequests: admin.firestore.FieldValue.increment(1)
            });
        } catch {} // ignore if doc missing
    }

    async revokeServer(serverId) {
        await this.db.collection('servers').doc(serverId).update({ acpted: false });
    }

    // Hard delete toàn bộ data server (dùng khi bot bị kick)
    async deleteServerData(serverId) {
        try {
            const serverRef = this.db.collection('servers').doc(serverId);
            // Xóa subcollection users và history của từng user
            const usersSnap = await serverRef.collection('users').get();
            for (const userDoc of usersSnap.docs) {
                const histSnap = await userDoc.ref.collection('history').get();
                const batch = this.db.batch();
                histSnap.docs.forEach(d => batch.delete(d.ref));
                batch.delete(userDoc.ref);
                await batch.commit();
            }
            await serverRef.delete();
            Logger.success(`🗑️ Deleted server data: ${serverId}`);
        } catch (e) {
            Logger.error(`deleteServerData error (${serverId}):`, e.message);
        }
    }

    /* ─────────────────────────────────────────
       SERVER USERS  (servers/{sid}/users/{uid})
       Bản copy của global profile, tạo tự động khi user dùng bot lần đầu trong server
    ───────────────────────────────────────── */
    async getServerUser(serverId, userId) {
        const doc = await this.db.collection('servers').doc(serverId)
            .collection('users').doc(userId).get();
        return doc.exists ? doc.data() : null;
    }

    // Copy global → server nếu chưa có, trả về server user doc
    async ensureServerUser(serverId, userId) {
        const ref = this.db.collection('servers').doc(serverId).collection('users').doc(userId);
        const existing = await ref.get();
        if (existing.exists) return existing.data();

        const globalUser = await this.getUser(userId);
        if (!globalUser) return null; // Chưa signup global

        await ref.set({
            ...globalUser,
            serverId,
            joinedServerAt: admin.firestore.FieldValue.serverTimestamp()
        });
        Logger.info(`📋 Copied global→server user: ${userId.slice(0,6)} → ${serverId}`);
        return globalUser;
    }

    /* ─────────────────────────────────────────
       SERVER HISTORY  (servers/{sid}/users/{uid}/history)
    ───────────────────────────────────────── */
    async addServerHistory(serverId, userId, data) {
        const ttl = new Date(); ttl.setDate(ttl.getDate() + Config.HISTORY_DAYS);
        await this.db.collection('servers').doc(serverId)
            .collection('users').doc(userId)
            .collection('history').doc(`qa_${Date.now()}`).set({
                question:  (data.question || '').slice(0, 500),
                answer:    (data.answer   || '').slice(0, 1500),
                model:     data.model || 'instant',
                ttl:       admin.firestore.Timestamp.fromDate(ttl),
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
    }

    async getServerHistory(serverId, userId, limit = 50) {
        const snap = await this.db.collection('servers').doc(serverId)
            .collection('users').doc(userId)
            .collection('history').orderBy('timestamp', 'desc').limit(limit).get();
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    async clearServerHistory(serverId, userId) {
        const snap = await this.db.collection('servers').doc(serverId)
            .collection('users').doc(userId).collection('history').get();
        const batch = this.db.batch();
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
    }

    /* ─────────────────────────────────────────
       QUOTA & BANNED (dùng global)
    ───────────────────────────────────────── */
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
            ...data, bannedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    async unbanUser(userId) {
        await this.db.collection('banned').doc(userId).update({ isActive: false });
    }

    async resetAllQuotas() {
        const snap = await this.db.collection('users_global').get();
        const batch = this.db.batch();
        snap.docs.forEach(doc => {
            batch.update(doc.ref, {
                'quota.instant.dailyRequests':  0,
                'quota.instant.lastReset':      admin.firestore.FieldValue.serverTimestamp(),
                'quota.thinking.dailyRequests': 0,
                'quota.thinking.lastReset':     admin.firestore.FieldValue.serverTimestamp()
            });
        });
        await batch.commit();
        Logger.success(`Reset quota for ${snap.size} users`);
    }

    /* ─────────────────────────────────────────
       PRIVATE CHAT (không đổi)
    ───────────────────────────────────────── */
    async getPrivateChat(userId) {
        const doc = await this.db.collection('privateChats').doc(userId).get();
        return doc.exists ? doc.data() : null;
    }
    async deletePrivateChat(userId) {
        await this.db.collection('privateChats').doc(userId).delete();
    }
}

module.exports = new FirebaseManager();
