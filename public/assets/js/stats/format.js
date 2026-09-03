// Number / unit / label formatting for the flight statistics page.
// Plain global script (window.FlightFormat), also require()-able from Node.
(function (root) {
    'use strict';

    var MONTHS = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    function isNum(n) {
        return typeof n === 'number' && isFinite(n);
    }

    // 1235077 -> "1,235,077"
    function formatNumber(n, decimals) {
        if (!isNum(n)) return '--';
        var d = decimals || 0;
        return n.toLocaleString('en-US', {
            minimumFractionDigits: d,
            maximumFractionDigits: d
        });
    }

    // 1235077 -> "1,235,077 km"; { unit: false } drops the suffix.
    function formatKm(km, opts) {
        var o = opts || {};
        if (!isNum(km)) return '--';
        var body = o.compact ? formatCompact(km) : formatNumber(km, o.decimals);
        return o.unit === false ? body : body + ' km';
    }

    // 1235077 -> "1.2M"; 238885 -> "239k"; 877 -> "877"
    function formatCompact(n) {
        if (!isNum(n)) return '--';
        var abs = Math.abs(n);
        if (abs >= 1e9) return trimZero(n / 1e9) + 'B';
        if (abs >= 1e6) return trimZero(n / 1e6) + 'M';
        if (abs >= 1e4) return Math.round(n / 1e3) + 'k';
        if (abs >= 1e3) return trimZero(n / 1e3) + 'k';
        return String(Math.round(n));
    }

    function trimZero(v) {
        var s = v.toFixed(1);
        return s.slice(-2) === '.0' ? s.slice(0, -2) : s;
    }

    // 7 | "July" | "Jul" -> "July"; { short: true } -> "Jul"; unknown -> "Unknown"
    function formatMonth(month, opts) {
        var o = opts || {};
        var name = null;
        if (isNum(month) && month >= 0 && month <= 11) {
            name = MONTHS[month];
        } else if (typeof month === 'string') {
            var needle = month.trim().toLowerCase();
            for (var i = 0; i < MONTHS.length; i++) {
                var m = MONTHS[i].toLowerCase();
                if (m === needle || m.slice(0, 3) === needle) { name = MONTHS[i]; break; }
            }
        }
        if (name === null) return o.unknown || 'Unknown';
        return o.short ? name.slice(0, 3) : name;
    }

    // 3.213 -> "3.2x"
    function formatRatio(value, opts) {
        var o = opts || {};
        if (!isNum(value)) return '--';
        var d = o.decimals === undefined ? 1 : o.decimals;
        return value.toFixed(d) + (o.suffix === undefined ? 'x' : o.suffix);
    }

    // 0.42 -> "42%"
    function formatPercent(fraction, decimals) {
        if (!isNum(fraction)) return '--';
        return (fraction * 100).toFixed(decimals || 0) + '%';
    }

    var api = {
        MONTHS: MONTHS,
        formatNumber: formatNumber,
        formatKm: formatKm,
        formatCompact: formatCompact,
        formatMonth: formatMonth,
        formatRatio: formatRatio,
        formatPercent: formatPercent
    };

    root.FlightFormat = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
