/* ── 经期记录：状态 + 日历标记 + 统计 + 设置 ──
   1. 顶部展示：经期第X天 / 距离预测经期X天 / 排卵期第X天 / 排卵日 / 距离排卵期X天
   2. 下方日历：经期=浅粉底圆圈；预测经期=浅粉虚线圆圈；排卵期=浅鹅黄底圆圈；排卵日圆圈下方标"排卵日"
   3. 日历下方：经期统计
   4. 右上角设置：周期长度 / 经期天数 / 黄体期 / 最近经期开始日
   定义：周期长度 = 本次月经第一天到下一次月经第一天之间天数；
       经期长度 = 每次月经持续天数；排卵日 = 下次月经预测日前约「黄体期」天；
       排卵期 = 排卵日前 5 天 + 后 4 天。 */
(function () {
    if (window.__PeriodAppLoaded) return;
    window.__PeriodAppLoaded = true;

    var $ = document.getElementById.bind(document);
    var PERIOD_KEY = 'tiPeriodSettings'; // { lastStart:'YYYY-MM-DD', cycleDays, periodDays, lutealDays }
    var LOG_KEY = 'tiPeriodLogs';        // { 'YYYY-MM-DD': { flow:[], symptoms:[], mood:[], note:'' } }
    var REMINDER_KEY = 'tiPeriodReminder'; // { enabled:true, advanceDays:[3,2,1,0], time:'HH:MM', quotes:[] }

    var FLOW_OPTIONS = ['很少', '较少', '正常', '较多', '很多'];
    var SYMPTOM_OPTIONS = ['痛经', '腰酸', '头痛', '腹胀', '胸胀', '疲惫', '恶心', '腹泻', '无'];
    var MOOD_OPTIONS = ['开心', '平静', '易怒', '焦虑', '低落', '烦躁'];

    // ── 与 desktop.js 一致的分桶存储 ──
    function dsSid() { return (typeof SESSION_ID !== 'undefined' && SESSION_ID) ? String(SESSION_ID) : ''; }
    function dsScope(base) { return (window.APP_PREFIX || '') + dsSid() + '_' + base; }
    function dsGet(base) { try { return localStorage.getItem(dsScope(base)); } catch (e) { return null; } }
    function dsSet(base, val) { try { localStorage.setItem(dsScope(base), val); } catch (e) {} }

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function pad2(n) { n = parseInt(n, 10); return (n < 10 ? '0' : '') + n; }
    function fmtYM(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
    function fmtMD(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
    function ymdToDate(s) {
        var p = String(s || '').split('-');
        if (p.length !== 3) return null;
        var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
        return isNaN(d.getTime()) ? null : d;
    }
    function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
    function dayDiff(a, b) {
        var A = new Date(a.getFullYear(), a.getMonth(), a.getDate());
        var B = new Date(b.getFullYear(), b.getMonth(), b.getDate());
        return Math.round((A - B) / 86400000);
    }
    function g(v, dflt) { var n = parseInt(v, 10); return isNaN(n) ? dflt : n; }

    // ── 设置读写 ──
    function getSettings() {
        try { var v = JSON.parse(dsGet(PERIOD_KEY)); return v || null; } catch (e) { return null; }
    }
    function saveSettings(s) { dsSet(PERIOD_KEY, JSON.stringify(s || null)); }

    function getLogs() {
        try { var v = JSON.parse(dsGet(LOG_KEY)); return (v && typeof v === 'object') ? v : {}; } catch (e) { return {}; }
    }
    function saveLogs(o) { dsSet(LOG_KEY, JSON.stringify(o || {})); }

    function getReminder() {
        try { var v = JSON.parse(dsGet(REMINDER_KEY)); return (v && typeof v === 'object') ? v : {}; } catch (e) { return {}; }
    }
    function saveReminder(r) { dsSet(REMINDER_KEY, JSON.stringify(r || {})); }
    function defaultReminder() { return { enabled: true, advanceDays: [1], time: '09:00', quotes: [] }; }

    function parseHM(hhmm) {
        var m = String(hhmm || '').match(/^(\d{1,2}):(\d{1,2})$/);
        if (!m) return null;
        return { h: parseInt(m[1], 10), m: parseInt(m[2], 10) };
    }

    // 当前周期锚点（<= 目标日期的最近一次经期开始）
    function periodStartFor(d, s) {
        var first = ymdToDate(s.lastStart);
        if (!first) return null;
        var cycle = g(s.cycleDays, 28) || 28;
        var diff = dayDiff(d, first);
        var k = Math.floor(diff / cycle);
        return addDays(first, k * cycle);
    }

    // 顶部状态
    function computeStatus(s, today) {
        if (!s || !s.lastStart) return null;
        var first = ymdToDate(s.lastStart);
        if (!first) return null;
        var cycle = g(s.cycleDays, 28), pDays = g(s.periodDays, 5), luteal = g(s.lutealDays, 14);
        if (cycle <= 0 || pDays <= 0 || luteal <= 0) return null;
        today = today || new Date(); today.setHours(0, 0, 0, 0);
        var P = periodStartFor(today, s);
        var periodEnd = addDays(P, pDays - 1);
        var nextP = addDays(P, cycle);
        var ovuDay = addDays(nextP, -luteal);
        var ovuStart = addDays(ovuDay, -5);
        var ovuEnd = addDays(ovuDay, 4);
        var inPeriod = dayDiff(today, P) >= 0 && dayDiff(today, P) < pDays;
        if (inPeriod) {
            return { main: '经期第' + (dayDiff(today, P) + 1) + '天', sub: '预计 ' + fmtMD(periodEnd) + ' 结束' };
        }
        if (dayDiff(today, ovuStart) < 0) {
            return { main: '距离排卵期' + dayDiff(ovuStart, today) + '天', sub: '预计 ' + fmtMD(ovuDay) + ' 排卵' };
        }
        if (dayDiff(today, ovuEnd) <= 0) {
            if (dayDiff(today, ovuDay) === 0) return { main: '排卵日', sub: '今天状态棒棒哒' };
            return { main: '排卵期第' + (dayDiff(today, ovuStart) + 1) + '天', sub: dayDiff(today, ovuDay) < 0 ? '即将到排卵日' : '刚过排卵日' };
        }
        return { main: '距离预测经期' + dayDiff(nextP, today) + '天', sub: '预计 ' + fmtMD(nextP) + ' 开始' };
    }

    // 某天在日历中的标记种类
    function classifyDay(d, s) {
        var res = { kind: null };
        if (!s || !s.lastStart) return res;
        var first = ymdToDate(s.lastStart);
        if (!first) return res;
        var cycle = g(s.cycleDays, 28), pDays = g(s.periodDays, 5), luteal = g(s.lutealDays, 14);
        if (cycle <= 0 || pDays <= 0 || luteal <= 0) return res;
        var P = periodStartFor(d, s);
        var inPeriod = dayDiff(d, P) >= 0 && dayDiff(d, P) < pDays;
        if (inPeriod) {
            var today0 = new Date(); today0.setHours(0, 0, 0, 0);
            res.kind = (P <= today0) ? 'period' : 'predicted';
            return res;
        }
        var nextP = addDays(P, cycle);
        var ovuDay = addDays(nextP, -luteal);
        var ovuStart = addDays(ovuDay, -5);
        var ovuEnd = addDays(ovuDay, 4);
        if (dayDiff(d, ovuStart) >= 0 && dayDiff(d, ovuEnd) <= 0) {
            res.kind = (dayDiff(d, ovuDay) === 0) ? 'ovuday' : 'ovu';
        }
        return res;
    }

    // ── 桌面卡片 ──
    function renderDesktopCard() {
        var el = $('dt-period-status');
        if (!el) return;
        var s = getSettings();
        if (!s || !s.lastStart) { el.innerHTML = '<div class="dt-p3-empty">设置经期信息后<br>展示贴心提醒</div>'; return; }
        var st = computeStatus(s);
        if (!st) { el.innerHTML = '<div class="dt-p3-empty">经期信息有误<br>请重新设置</div>'; return; }
        el.innerHTML = '<div class="dt-p3-status-main">' + esc(st.main) + '</div>' +
            (st.sub ? '<div class="dt-p3-status-sub">' + esc(st.sub) + '</div>' : '');
    }

    // ── 页面渲染 ──
    var _curYear, _curMonth;
    function _initDate() { var n = new Date(); _curYear = n.getFullYear(); _curMonth = n.getMonth(); }
    _initDate();

    function renderStatus() {
        var main = $('pe-status-main'), sub = $('pe-status-sub');
        if (!main) return;
        var s = getSettings();
        if (!s || !s.lastStart) { main.textContent = '设置经期信息'; sub.textContent = '点击右上角开始记录'; return; }
        var st = computeStatus(s);
        if (!st) { main.textContent = '经期信息有误'; sub.textContent = '请重新设置'; return; }
        main.textContent = st.main;
        sub.textContent = st.sub || '';
    }

    function renderCalendar() {
        var title = $('pe-cal-title');
        if (title) title.textContent = _curYear + '年' + (_curMonth + 1) + '月';
        var grid = $('pe-cal-grid');
        if (!grid) return;
        var s = getSettings();
        var logs = getLogs();
        var first = new Date(_curYear, _curMonth, 1);
        var lead = (first.getDay() + 6) % 7;
        var daysInMonth = new Date(_curYear, _curMonth + 1, 0).getDate();
        var html = '';
        for (var i = 0; i < lead; i++) html += '<div class="pe-cal-cell pe-cal-blank"></div>';
        for (var d = 1; d <= daysInMonth; d++) {
            var dt = new Date(_curYear, _curMonth, d);
            var dateStr = fmtYM(dt);
            var kind = classifyDay(dt, s).kind;
            var hasLog = !!logs[dateStr];
            var cls = 'pe-cal-cell';
            if (kind) cls += ' pe-k-' + kind;
            html += '<div class="' + cls + '" data-date="' + dateStr + '">' +
                '<div class="pe-day-dot">' + d +
                    (hasLog ? '<i class="pe-log-flag"></i>' : '') +
                '</div>' +
                (kind === 'ovuday' ? '<div class="pe-day-tag">排卵日</div>' : '') +
                '</div>';
        }
        grid.innerHTML = html;
        renderStats();
    }

    function renderStats() {
        var el = $('pe-stats');
        if (!el) return;
        var s = getSettings();
        if (!s || !s.lastStart) {
            el.innerHTML = '<div class="pe-stats-empty">设置经期信息后展示统计</div>';
            return;
        }
        var first = ymdToDate(s.lastStart);
        if (!first) { el.innerHTML = '<div class="pe-stats-empty">经期信息有误</div>'; return; }
        var cycle = g(s.cycleDays, 28), pDays = g(s.periodDays, 5), luteal = g(s.lutealDays, 14);
        var today = new Date(); today.setHours(0, 0, 0, 0);
        var P = periodStartFor(today, s);
        var nextP = addDays(P, cycle);
        var ovuDay = addDays(nextP, -luteal);
        var ovuStart = addDays(ovuDay, -5);
        var ovuEnd = addDays(ovuDay, 4);
        var items = [
            { v: cycle + '', k: '周期长度(天)' },
            { v: pDays + '', k: '经期天数(天)' },
            { v: luteal + '', k: '黄体期(天)' },
            { v: fmtMD(nextP), k: '预计下次经期' },
            { v: fmtMD(ovuDay), k: '预计排卵日' },
            { v: dayDiff(nextP, today) + '天', k: '距离下次经期' }
        ];
        var html = '<div class="pe-stats-grid">';
        for (var i = 0; i < items.length; i++) {
            html += '<div class="pe-stat"><span class="pe-stat-v">' + esc(items[i].v) + '</span>' +
                '<span class="pe-stat-k">' + esc(items[i].k) + '</span></div>';
        }
        html += '</div>' +
            '<div class="pe-stats-line">排卵期：' + fmtMD(ovuStart) + ' ~ ' + fmtMD(ovuEnd) + '</div>';
        el.innerHTML = html;
    }

    function renderPage() { renderStatus(); renderCalendar(); }

    // ── 设置弹窗 ──
    function openSettings() {
        var s = getSettings() || { lastStart: fmtYM(new Date()), cycleDays: 28, periodDays: 5, lutealDays: 14 };
        var date = $('pe-date'); if (date) date.value = s.lastStart || '';
        var cyc = $('pe-cycle'); if (cyc) cyc.value = g(s.cycleDays, 28);
        var pd = $('pe-period'); if (pd) pd.value = g(s.periodDays, 5);
        var lu = $('pe-luteal'); if (lu) lu.value = g(s.lutealDays, 14);
        var modal = $('period-settings-modal');
        if (modal) {
            if (typeof window.showModal === 'function') window.showModal(modal);
            else modal.style.display = 'flex';
        }
    }
    function closeSettings() {
        var modal = $('period-settings-modal');
        if (modal) {
            if (typeof window.hideModal === 'function') window.hideModal(modal);
            else modal.style.display = 'none';
        }
    }
    function saveSettingsFromModal() {
        var date = $('pe-date');
        var lastStart = date ? date.value : '';
        if (!lastStart) { if (date) { date.focus(); date.style.borderColor = '#e74c3c'; } return; }
        var cycle = g($('pe-cycle') ? $('pe-cycle').value : '', 28);
        var pDays = g($('pe-period') ? $('pe-period').value : '', 5);
        var luteal = g($('pe-luteal') ? $('pe-luteal').value : '', 14);
        if (cycle <= 0 || pDays <= 0 || luteal <= 0) return;
        saveSettings({ lastStart: lastStart, cycleDays: cycle, periodDays: pDays, lutealDays: luteal });
        renderPage();
        renderDesktopCard();
        closeSettings();
    }

    // ── 当日记录弹窗（流量单选 / 症状多选 / 心情多选 / 碎碎念） ──
    var _logDate = null;
    function renderCapsules(boxId, options, selected, multi) {
        var box = $(boxId);
        if (!box) return;
        box.setAttribute('data-multi', multi ? '1' : '0');
        var sel = selected || [];
        box.innerHTML = '';
        for (var i = 0; i < options.length; i++) {
            var on = sel.indexOf(options[i]) >= 0;
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'pe-cap' + (on ? ' active' : '');
            b.setAttribute('data-val', options[i]);
            b.textContent = options[i];
            box.appendChild(b);
        }
    }
    function readSelected(boxId) {
        var box = $(boxId);
        var out = [];
        if (!box) return out;
        var caps = box.querySelectorAll('.pe-cap.active');
        for (var i = 0; i < caps.length; i++) out.push(caps[i].getAttribute('data-val'));
        return out;
    }
    function openLogModal(dateStr) {
        _logDate = dateStr;
        var d = ymdToDate(dateStr);
        var title = $('pe-log-title');
        if (title) title.textContent = (d ? (d.getMonth() + 1) + '月' + d.getDate() + '日' : dateStr) + ' · 当日记录';
        var logs = getLogs();
        var rec = logs[dateStr] || {};
        renderCapsules('pe-flow', FLOW_OPTIONS, rec.flow, false);
        renderCapsules('pe-symptoms', SYMPTOM_OPTIONS, rec.symptoms, true);
        renderCapsules('pe-mood', MOOD_OPTIONS, rec.mood, true);
        var note = $('pe-note'); if (note) note.value = rec.note || '';
        var modal = $('period-log-modal');
        if (modal) { if (typeof window.showModal === 'function') window.showModal(modal); else modal.style.display = 'flex'; }
    }
    function closeLogModal() {
        var modal = $('period-log-modal');
        if (modal) { if (typeof window.hideModal === 'function') window.hideModal(modal); else modal.style.display = 'none'; }
    }
    function saveLog() {
        if (!_logDate) return;
        var rec = {
            flow: readSelected('pe-flow'),
            symptoms: readSelected('pe-symptoms'),
            mood: readSelected('pe-mood'),
            note: (($('pe-note') && $('pe-note').value) || '').trim()
        };
        var logs = getLogs();
        var empty = rec.flow.length === 0 && rec.symptoms.length === 0 && rec.mood.length === 0 && rec.note === '';
        if (empty) delete logs[_logDate];
        else logs[_logDate] = rec;
        saveLogs(logs);
        renderCalendar();
        closeLogModal();
    }

    function bindEvents() {
        var prev = $('pe-cal-prev');
        if (prev) prev.addEventListener('click', function () { _curMonth--; if (_curMonth < 0) { _curMonth = 11; _curYear--; } renderPage(); });
        var next = $('pe-cal-next');
        if (next) next.addEventListener('click', function () { _curMonth++; if (_curMonth > 11) { _curMonth = 0; _curYear++; } renderPage(); });
        var cancel = $('pe-cancel');
        if (cancel) cancel.addEventListener('click', closeSettings);
        var save = $('pe-save');
        if (save) save.addEventListener('click', saveSettingsFromModal);
        var modal = $('period-settings-modal');
        if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) closeSettings(); });
        // 点击日历日期打开当日记录
        var grid = $('pe-cal-grid');
        if (grid) grid.addEventListener('click', function (e) {
            var cell = (e.target && e.target.closest) ? e.target.closest('.pe-cal-cell') : null;
            if (!cell) return;
            var date = cell.getAttribute('data-date');
            if (date) openLogModal(date);
        });
        // 当日记录弹窗：胶囊选择 / 遮罩关闭
        var logModal = $('period-log-modal');
        if (logModal) {
            logModal.addEventListener('click', function (e) {
                if (e.target === logModal) { closeLogModal(); return; }
                var cap = (e.target && e.target.closest) ? e.target.closest('.pe-cap') : null;
                if (!cap) return;
                e.preventDefault();
                var box = cap.parentNode;
                var multi = box && box.getAttribute('data-multi') === '1';
                if (!multi) {
                    var wasActive = cap.classList.contains('active');
                    var all = box.querySelectorAll('.pe-cap');
                    for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
                    if (!wasActive) cap.classList.add('active');
                } else {
                    cap.classList.toggle('active');
                }
            });
        }
        var logCancel = $('pe-log-cancel');
        if (logCancel) logCancel.addEventListener('click', closeLogModal);
        var logSave = $('pe-log-save');
        if (logSave) logSave.addEventListener('click', saveLog);

        // 经期提醒设置弹窗
        var remSw = $('pe-reminder-switch');
        if (remSw) remSw.addEventListener('click', function () { _remEnabled = !_remEnabled; _syncReminderSwitch(); });
        var advBox = $('pe-advance-days');
        if (advBox) advBox.addEventListener('click', function (e) {
            var b = (e.target && e.target.closest) ? e.target.closest('.pe-cap') : null;
            if (!b) return;
            e.preventDefault();
            var v = parseInt(b.getAttribute('data-v'), 10);
            var idx = _remAdvance.indexOf(v);
            if (idx >= 0) _remAdvance.splice(idx, 1); else _remAdvance.push(v);
            _renderAdvanceChips();
        });
        var quoteAdd = $('pe-quote-add-btn');
        if (quoteAdd) quoteAdd.addEventListener('click', _addQuote);
        var quoteInput = $('pe-quote-input');
        if (quoteInput) quoteInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); _addQuote(); } });
        var quoteList = $('pe-quote-list');
        if (quoteList) quoteList.addEventListener('click', function (e) {
            var b = (e.target && e.target.closest) ? e.target.closest('.rl-act-btn') : null;
            if (!b) return;
            var i = parseInt(b.getAttribute('data-i'), 10);
            if (b.getAttribute('data-action') === 'delete') _deleteQuote(i);
            else if (b.getAttribute('data-action') === 'edit') _editQuote(i);
            else if (b.getAttribute('data-action') === 'disable') _toggleQuoteDisable(i);
        });
        var remCancel = $('pe-reminder-cancel');
        if (remCancel) remCancel.addEventListener('click', closeReminderSettings);
        var remSave = $('pe-reminder-save');
        if (remSave) remSave.addEventListener('click', saveReminderFromModal);
        var remModal = $('period-reminder-modal');
        if (remModal) remModal.addEventListener('click', function (e) { if (e.target === remModal) closeReminderSettings(); });
    }

    // ── 经期提醒设置（开关 / 提前天数 / 时间滚轴 / 自定义语录） ──
    var _remEnabled = true;
    var _remAdvance = [];
    var _remTime = { h: 9, m: 0 };
    var _remQuotes = [];

    var ITEM_H = 40;
    function fillWheel(wheelEl, min, max, initial, onChange) {
        wheelEl.innerHTML = '';
        var list = document.createElement('div');
        list.className = 'np-wheel-list';
        var items = [];
        for (var i = min; i <= max; i++) {
            var it = document.createElement('div');
            it.className = 'np-wheel-item';
            it.textContent = pad2(i);
            list.appendChild(it);
            items.push(it);
        }
        wheelEl.appendChild(list);
        function getIndex() { return Math.round(list.scrollTop / ITEM_H); }
        function update() {
            var idx = getIndex();
            if (idx < 0) idx = 0;
            if (idx > items.length - 1) idx = items.length - 1;
            for (var k = 0; k < items.length; k++) items[k].classList.toggle('np-sel', k === idx);
            if (onChange) onChange(min + idx, idx);
        }
        list.addEventListener('scroll', function () {
            if (wheelEl._raf) cancelAnimationFrame(wheelEl._raf);
            wheelEl._raf = requestAnimationFrame(update);
        });
        var initIdx = Math.max(0, Math.min(items.length - 1, (parseInt(initial, 10) || 0) - min));
        list.scrollTop = initIdx * ITEM_H;
        requestAnimationFrame(update);
        wheelEl._getValue = function () { return min + getIndex(); };
    }

    function _syncReminderSwitch() {
        var sw = $('pe-reminder-switch');
        if (sw) sw.classList.toggle('on', _remEnabled);
    }
    function _renderAdvanceChips() {
        var box = $('pe-advance-days');
        if (!box) return;
        var btns = box.querySelectorAll('.pe-cap');
        for (var i = 0; i < btns.length; i++) {
            var v = parseInt(btns[i].getAttribute('data-v'), 10);
            btns[i].classList.toggle('active', _remAdvance.indexOf(v) >= 0);
        }
    }
    var ICON_EDIT = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M8.5 2l2.5 2.5L4 11.5H1.5V9L8.5 2z" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>';
    var ICON_TRASH = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><line x1="2" y1="3" x2="11" y2="3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M4.5 3V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5V3"/><path d="M3.5 3.5l.5 7h5l.5-7" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>';
    var ICON_EYE = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 6.5s2-4 5-4 5 4 5 4-2 4-5 4-5-4-5-4z" stroke="currentColor" stroke-width="1.2"/><circle cx="6.5" cy="6.5" r="1.5" fill="currentColor"/></svg>';
    var ICON_EYE_OFF = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><line x1="2" y1="2" x2="11" y2="11" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><path d="M4.5 3.5C5.1 3.2 5.7 3 6.5 3c3 0 5 3.5 5 3.5s-.5 1-1.5 2M2 5s-.5.8-.5 1.5c0 .6.2 1.1.5 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';
    function _renderQuotes() {
        var box = $('pe-quote-list');
        if (!box) return;
        box.innerHTML = '';
        if (!_remQuotes.length) {
            box.innerHTML = '<div class="pe-quote-empty">暂无提醒语录，添加后到点随机播报</div>';
            return;
        }
        for (var i = 0; i < _remQuotes.length; i++) {
            var q = _remQuotes[i];
            var disabled = q.enabled === false;
            var c = document.createElement('div');
            c.className = 'rl-card';
            c.innerHTML =
                '<div style="flex:1;min-width:0;' + (disabled ? 'opacity:0.4;text-decoration:line-through;' : '') + '">' +
                    '<span style="font-size:13px;line-height:1.5;word-break:break-word;">' + esc(q.text) + '</span>' +
                '</div>' +
                '<div class="rl-card-actions">' +
                    '<button class="rl-act-btn' + (disabled ? ' active' : '') + '" data-action="disable" data-i="' + i + '" title="' + (disabled ? '启用' : '屏蔽') + '">' + (disabled ? ICON_EYE : ICON_EYE_OFF) + '</button>' +
                    '<button class="rl-act-btn" data-action="edit" data-i="' + i + '" title="编辑">' + ICON_EDIT + '</button>' +
                    '<button class="rl-act-btn danger" data-action="delete" data-i="' + i + '" title="删除">' + ICON_TRASH + '</button>' +
                '</div>';
            box.appendChild(c);
        }
    }
    function _editQuote(i) {
        if (i < 0 || i >= _remQuotes.length) return;
        var input = $('pe-quote-input');
        if (input) {
            input.value = _remQuotes[i].text;
            input.focus();
        }
        _remQuotes.splice(i, 1);
        _renderQuotes();
    }
    function _deleteQuote(i) {
        if (i < 0 || i >= _remQuotes.length) return;
        _remQuotes.splice(i, 1);
        _renderQuotes();
    }
    function _toggleQuoteDisable(i) {
        if (i < 0 || i >= _remQuotes.length) return;
        _remQuotes[i].enabled = _remQuotes[i].enabled === false;
        _renderQuotes();
    }
    function _addQuote() {
        var input = $('pe-quote-input');
        if (!input) return;
        var v = (input.value || '').trim();
        if (!v) return;
        _remQuotes.push({ text: v, enabled: true });
        input.value = '';
        _renderQuotes();
    }

    function openReminderSettings() {
        var r = getReminder();
        if (r.enabled === undefined || !('advanceDays' in r)) r = defaultReminder();
        _remEnabled = r.enabled !== false;
        _remAdvance = (Array.isArray(r.advanceDays) && r.advanceDays.length) ? r.advanceDays.slice() : defaultReminder().advanceDays.slice();
        var hm = parseHM(r.time);
        _remTime.h = hm ? hm.h : 9;
        _remTime.m = hm ? hm.m : 0;
        _remQuotes = (Array.isArray(r.quotes) ? r.quotes : []).map(function (q) {
            if (q && typeof q === 'object' && 'text' in q) return { text: String(q.text), enabled: q.enabled !== false };
            return { text: String(q), enabled: true };
        });
        _syncReminderSwitch();
        _renderAdvanceChips();
        if ($('pe-remind-hour')) fillWheel($('pe-remind-hour'), 0, 23, _remTime.h, function (v) { _remTime.h = v; });
        if ($('pe-remind-minute')) fillWheel($('pe-remind-minute'), 0, 59, _remTime.m, function (v) { _remTime.m = v; });
        _renderQuotes();
        var modal = $('period-reminder-modal');
        if (modal) { if (typeof window.showModal === 'function') window.showModal(modal); else modal.style.display = 'flex'; }
    }
    function closeReminderSettings() {
        var modal = $('period-reminder-modal');
        if (modal) { if (typeof window.hideModal === 'function') window.hideModal(modal); else modal.style.display = 'none'; }
    }
    function saveReminderFromModal() {
        saveReminder({
            enabled: !!_remEnabled,
            advanceDays: _remAdvance.slice().sort(function (a, b) { return b - a; }),
            time: pad2(_remTime.h) + ':' + pad2(_remTime.m),
            quotes: _remQuotes.map(function (q) { return { text: q.text, enabled: q.enabled !== false }; })
        });
        closeReminderSettings();
        schedulePeriodReminders();
    }

    // ── 经期提醒调度：到点弹出系统弹窗 + 随机语录 ──
    var _remFired = {};
    var _remTimer = null;

    function predictedStarts(s, now, count) {
        var res = [];
        if (!s || !s.lastStart) return res;
        var t = new Date(now); t.setHours(0, 0, 0, 0);
        var P = periodStartFor(t, s);
        if (!P) return res;
        var cycle = g(s.cycleDays, 28) || 28;
        for (var k = 0; k < count + 4 && res.length < count; k++) {
            var cand = addDays(P, k * cycle);
            if (cand.getTime() >= t.getTime()) res.push(cand);
        }
        return res;
    }
    function reminderMoments(s, r, now, horizonDays) {
        var out = [];
        if (!r || r.enabled === false || !s || !s.lastStart) return out;
        var adv = Array.isArray(r.advanceDays) ? r.advanceDays : [];
        if (!adv.length) return out;
        var hm = parseHM(r.time) || { h: 9, m: 0 };
        var starts = predictedStarts(s, now, 12);
        var limit = now.getTime() + (horizonDays || 90) * 86400000;
        for (var i = 0; i < starts.length; i++) {
            for (var j = 0; j < adv.length; j++) {
                var day = addDays(starts[i], -parseInt(adv[j], 10));
                var dt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hm.h, hm.m, 0, 0);
                if (dt.getTime() > now.getTime() - 90000 && dt.getTime() <= limit) out.push(dt.getTime());
            }
        }
        out.sort(function (a, b) { return a - b; });
        return out;
    }
    function firePeriodReminder(quote) {
        var pName = (typeof settings !== 'undefined' && settings.partnerName) || '梦角';
        var title = pName;
        var body = quote || '经期时间到啦，注意休息哦';
        try { if (typeof window.showSystemInfoPopup === 'function') window.showSystemInfoPopup(title, body, {}); } catch (e) {}
        try { if (typeof PushBridge !== 'undefined' && typeof PushBridge.send === 'function') PushBridge.send(title, body, { inForeground: true, sender: pName }); } catch (e) {}
    }
    function checkPeriodReminders() {
        var s = getSettings();
        var r = getReminder();
        if (!s || !s.lastStart || !r || r.enabled === false) return;
        var now = Date.now();
        var moments = reminderMoments(s, r, new Date(now), 90);
        var quotes = [];
        var rawQuotes = Array.isArray(r.quotes) ? r.quotes : [];
        for (var qi = 0; qi < rawQuotes.length; qi++) {
            var qq = rawQuotes[qi];
            var txt = (qq && typeof qq === 'object') ? String(qq.text) : String(qq);
            var on = (qq && typeof qq === 'object') ? (qq.enabled !== false) : true;
            if (txt && on) quotes.push(txt);
        }
        if (!quotes.length) quotes = ['经期时间到啦，注意休息哦'];
        for (var i = 0; i < moments.length; i++) {
            var ts = moments[i];
            if (ts <= now && (now - ts) < 90000) {
                if (_remFired[ts]) continue;
                _remFired[ts] = true;
                firePeriodReminder(quotes[Math.floor(Math.random() * quotes.length)]);
            }
        }
        var c = 0;
        for (var k in _remFired) { if (Object.prototype.hasOwnProperty.call(_remFired, k)) c++; }
        if (c > 500) _remFired = {};
    }
    function schedulePeriodReminders() {
        checkPeriodReminders();
        if (_remTimer) return;
        _remTimer = setInterval(checkPeriodReminders, 30000);
    }

    // ── 挂载 ──
    window.PeriodApp = {
        render: renderPage,
        renderDesktopCard: renderDesktopCard,
        computeStatus: computeStatus,
        getSettings: getSettings,
        onShow: renderPage
    };
    window.openPeriodSettings = openSettings;
    window.openPeriodLog = openLogModal;
    window.openPeriodReminder = openReminderSettings;

    var _origOpenPeriod = window.openPeriodPage;
    window.openPeriodPage = function () {
        if (_origOpenPeriod) _origOpenPeriod();
        renderPage();
    };

    function init() {
        bindEvents();
        renderDesktopCard();
        renderPage();
        schedulePeriodReminders();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();