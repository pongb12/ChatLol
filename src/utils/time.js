const VN_TZ = 'Asia/Ho_Chi_Minh';

/**
 * Format date sang giờ Việt Nam (UTC+7)
 * Thay thế toàn bộ .toLocaleString('vi-VN') không có timezone
 */
function formatVN(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return 'N/A';
    return date.toLocaleString('vi-VN', { timeZone: VN_TZ });
}

/**
 * Tìm mốc reset gần nhất dựa vào RESET_HOUR_UTC
 * VD: RESET_HOUR_UTC=0 → midnight UTC = 7h sáng VN
 */
function getLastResetBoundary(resetHourUTC) {
    const now = new Date();
    const boundary = new Date(now);
    boundary.setUTCHours(resetHourUTC, 0, 0, 0);
    // Nếu mốc hôm nay chưa tới thì lùi về hôm qua
    if (boundary > now) {
        boundary.setUTCDate(boundary.getUTCDate() - 1);
    }
    return boundary;
}

/**
 * Tính thời điểm reset tiếp theo
 */
function getNextResetTime(resetHourUTC) {
    const boundary = getLastResetBoundary(resetHourUTC);
    const next = new Date(boundary);
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
}

module.exports = { formatVN, getLastResetBoundary, getNextResetTime };
