/* ── 记事本：当月日历 + 当日待办 + 新增待办弹窗 ──
   1. 界面上方展示当月日历，可切换月份
   2. 点击某日期后，日历下方展示当天待办
   3. 右上角 + 按钮弹出新增待办弹窗：
      - 第一排：待办名称
      - 第二排：待办时间（几点，滚轴选择 时:分）
      - 第三排：重复提醒（不重复→日期选择；重复→周一到周日多选）
      - 第四排：提醒时间（到点提醒 / 提前提醒，提前提醒可自定义提前多久，
        小时滚轴最大 48，分钟滚轴最大 60）
   数据持久化到 localStorage（与 desktop.js 使用相同分桶 key）。 */
(function () {
    if (window.__NotesAppLoaded) return;
    window.__NotesAppLoaded = true;

    var $ = document.getElementById.bind(document);
    var NOTES_KEY = 'tiNotesTodos';

    // ── 与 desktop.js 一致的按对象分桶存储 ──
    function dsSid() { return (typeof SESSION_ID !== 'undefined' && SESSION_ID) ? String(SESSION_ID) : ''; }
    function dsScope(base) { return (window.APP_PREFIX || '') + dsSid() + '_' + base; }
    function dsGet(base) { try { return localStorage.getItem(dsScope(base)); } catch (e) { return null; } }
    function dsSet(base, val) { try { localStorage.setItem(dsScope(base), val); } catch (e) {} }

    function uid() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function pad2(n) { n = parseInt(n, 10); return (n < 10 ? '0' : '') + n; }
    function fmtYM(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

    // ── 数据存取 ──
    // todo: { id, text, time('HH:MM'), date('YYYY-MM-DD'，不重复时),
    //         repeat('none'|'weekly'), weekdays([1..7]，周日=7),
    //         remind('ontime'|'advance'), advanceMinutes(Number) }
    function getTodos() {
        try { var v = JSON.parse(dsGet(NOTES_KEY)); return Array.isArray(v) ? v : []; }
        catch (e) { return []; }
    }
    function saveTodos(list) { dsSet(NOTES_KEY, JSON.stringify(list || [])); }

    function parseHM(hhmm) {
        var m = String(hhmm || '').match(/^(\d{1,2}):(\d{1,2})$/);
        if (!m) return null;
        return { h: parseInt(m[1], 10), m: parseInt(m[2], 10) };
    }
    function weekdaySet(todo) {
        var set = [];
        if (todo.repeat === 'weekly' && Array.isArray(todo.weekdays)) {
            for (var i = 0; i < todo.weekdays.length; i++) {
                var v = parseInt(todo.weekdays[i], 10);
                if (v >= 1 && v <= 7) set.push(v % 7); // 周日7→0，周一1→1 ... 周六6→6
            }
        }
        return set;
    }
    // 计算待办下一次发生的时间（Date 或 null）
    function nextOccurrence(todo, now) {
        now = now || new Date();
        var hm = parseHM(todo.time);
        var H = hm ? hm.h : 9, M = hm ? hm.m : 0;
        var wdSet = weekdaySet(todo);
        if (todo.repeat === 'weekly' && wdSet.length) {
            for (var i = 0; i <= 8; i++) {
                var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, H, M, 0, 0);
                if (wdSet.indexOf(d.getDay()) >= 0 && d.getTime() > now.getTime()) return d;
            }
            return null;
        }
        if (todo.date) {
            var p = String(todo.date).split('-');
            if (p.length === 3) {
                var dt = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10), H, M, 0, 0);
                if (!isNaN(dt.getTime())) return dt;
            }
        }
        var t = new Date(now.getFullYear(), now.getMonth(), now.getDate(), H, M, 0, 0);
        if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1);
        return t;
    }
    function relLabel(ts) {
        var now = new Date(); now.setHours(0, 0, 0, 0);
        var t = new Date(ts); t.setHours(0, 0, 0, 0);
        var diff = Math.round((t - now) / 86400000);
        var hm = parseHM(pad2(new Date(ts).getHours()) + ':' + pad2(new Date(ts).getMinutes()));
        var timeStr = hm ? (pad2(hm.h) + ':' + pad2(hm.m)) : '';
        if (diff === 0) return '今天 ' + timeStr;
        if (diff === 1) return '明天 ' + timeStr;
        if (diff === 2) return '后天 ' + timeStr;
        return (t.getMonth() + 1) + '/' + t.getDate() + ' ' + timeStr;
    }
    // 最近 N 条（按下次发生时间升序）
    function upcoming(limit) {
        var list = getTodos();
        var now = new Date();
        var arr = [];
        for (var i = 0; i < list.length; i++) {
            var d = nextOccurrence(list[i], now);
            if (!d) continue;
            arr.push({ text: list[i].text, time: list[i].time, label: relLabel(d.getTime()), ts: d.getTime() });
        }
        arr.sort(function (a, b) { return a.ts - b.ts; });
        return arr.slice(0, limit == null ? 3 : limit);
    }
    // 某天的待办
    function dayTodos(d) {
        var key = fmtYM(d);
        var wd = d.getDay();
        var list = getTodos();
        var res = [];
        for (var i = 0; i < list.length; i++) {
            var t = list[i];
            if (t.repeat === 'weekly' && weekdaySet(t).length) {
                if (weekdaySet(t).indexOf(wd) < 0) continue;
            } else {
                if (t.date !== key) continue;
            }
            res.push(t);
        }
        res.sort(function (a, b) { return (a.time || '').localeCompare(b.time || ''); });
        return res;
    }

    // ── 桌面卡片渲染（供 desktop.js 的 renderNotesList 调用）──
    function renderDesktopCard() {
        var el = $('dt-notes-list');
        if (!el) return;
        var items = upcoming(3);
        if (!items.length) {
            el.innerHTML = '<div class="dt-p3-empty">暂无待办<br>点击进入记录</div>';
            return;
        }
        var html = '';
        for (var i = 0; i < items.length; i++) {
            html += '<div class="dt-p3-note"><span class="dt-p3-note-dot"></span>' +
                '<span class="dt-p3-note-text">' + esc(items[i].text) + '</span>' +
                '<span class="dt-p3-note-time">' + esc(items[i].label) + '</span></div>';
        }
        el.innerHTML = html;
    }

    // ── 日历 ──
    var _curYear, _curMonth, _selDate; // selDate 为 Date（本地）
    function _initDateState() {
        var now = new Date();
        _curYear = now.getFullYear();
        _curMonth = now.getMonth();
        _selDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    _initDateState();

    function renderCalendar() {
        var title = $('notes-cal-title');
        if (title) title.textContent = _curYear + '年' + (_curMonth + 1) + '月';
        var grid = $('notes-cal-grid');
        if (!grid) return;
        var today = new Date();
        var first = new Date(_curYear, _curMonth, 1);
        var lead = (first.getDay() + 6) % 7; // 周一起始
        var daysInMonth = new Date(_curYear, _curMonth + 1, 0).getDate();
        var html = '';
        for (var i = 0; i < lead; i++) html += '<div class="np-cal-cell np-cal-blank"></div>';
        for (var d = 1; d <= daysInMonth; d++) {
            var dt = new Date(_curYear, _curMonth, d);
            var cls = 'np-cal-cell np-cal-day';
            if (dt.getFullYear() === today.getFullYear() && dt.getMonth() === today.getMonth() && dt.getDate() === today.getDate()) cls += ' np-today';
            if (_selDate && fmtYM(dt) === fmtYM(_selDate)) cls += ' np-sel';
            if (dayTodos(dt).length) cls += ' np-has';
            html += '<div class="' + cls + '" data-ymd="' + fmtYM(dt) + '">' + d + '</div>';
        }
        grid.innerHTML = html;
        renderDayList();
    }
    function renderDayList() {
        var el = $('notes-day-list');
        if (!el) return;
        var sel = _selDate || new Date();
        var label = $('notes-day-label');
        if (label) label.textContent = (sel.getMonth() + 1) + '月' + sel.getDate() + '日';
        var todos = dayTodos(sel);
        if (!todos.length) {
            el.innerHTML = '<div class="np-day-empty">当天暂无待办</div>';
            return;
        }
        var html = '';
        for (var i = 0; i < todos.length; i++) {
            var t = todos[i];
            var time = parseHM(t.time);
            html += '<div class="np-todo">' +
                '<div class="np-todo-time">' + (time ? (pad2(time.h) + ':' + pad2(time.m)) : '') + '</div>' +
                '<div class="np-todo-text">' + esc(t.text) + '</div>' +
                (t.repeat === 'weekly' ? '<div class="np-todo-tag">每周</div>' : '') +
                '<button class="np-todo-del" data-id="' + esc(t.id) + '" title="删除"><i class="fas fa-trash-alt"></i></button>' +
                '</div>';
        }
        el.innerHTML = html;
    }
    function renderNotesPage() {
        renderCalendar();
    }

    // ── 滚轴选择器 ──
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
        // 初始定位
        var initIdx = Math.max(0, Math.min(items.length - 1, (parseInt(initial, 10) || 0) - min));
        list.scrollTop = initIdx * ITEM_H;
        requestAnimationFrame(update);
        wheelEl._getValue = function () { return min + getIndex(); };
    }

    // ── 新增待办弹窗 ──
    var _time = { h: 9, m: 0 };
    var _adv = { h: 0, m: 30 };
    var _repeatSel = 'none';
    var _remindSel = 'ontime';
    var _weekdays = [];

    function resetModal() {
        var now = new Date();
        _time.h = now.getHours(); _time.m = now.getMinutes();
        _adv.h = 0; _adv.m = 30;
        _repeatSel = 'none';
        _remindSel = 'ontime';
        _weekdays = [];
        var name = $('todo-name'); if (name) name.value = '';
        var date = $('todo-date');
        if (date) date.value = fmtYM(now);
        // 滚轴
        if ($('todo-hour')) fillWheel($('todo-hour'), 0, 23, _time.h, function (v) { _time.h = v; });
        if ($('todo-minute')) fillWheel($('todo-minute'), 0, 59, _time.m, function (v) { _time.m = v; });
        if ($('adv-hour')) fillWheel($('adv-hour'), 0, 48, _adv.h, function (v) { _adv.h = v; _renderAdvText(); });
        if ($('adv-minute')) fillWheel($('adv-minute'), 0, 60, _adv.m, function (v) { _adv.m = v; _renderAdvText(); });
        // 分段按钮
        _setSeg('todo-repeat-seg', _repeatSel);
        _setSeg('todo-remind-seg', _remindSel);
        _refreshRepeatSub();
        _refreshRemindSub();
        _syncWeekdayChips();
        _renderAdvText();
    }
    function _renderAdvText() {
        var t = $('np-adv-text');
        if (t) t.textContent = _adv.h + '时' + _adv.m + '分';
    }
    function _setSeg(segId, value) {
        var seg = $(segId);
        if (!seg) return;
        var btns = seg.querySelectorAll('button');
        for (var i = 0; i < btns.length; i++) {
            btns[i].classList.toggle('active', btns[i].getAttribute('data-v') === value);
        }
    }
    function _refreshRepeatSub() {
        var dateBox = $('todo-repeat-date');
        var weekBox = $('todo-repeat-week');
        if (dateBox) dateBox.style.display = _repeatSel === 'none' ? 'block' : 'none';
        if (weekBox) weekBox.style.display = _repeatSel === 'weekly' ? 'block' : 'none';
    }
    function _refreshRemindSub() {
        var adv = $('todo-advance');
        if (adv) adv.style.display = _remindSel === 'advance' ? 'flex' : 'none';
    }
    function _syncWeekdayChips() {
        var box = $('todo-weekdays');
        if (!box) return;
        var btns = box.querySelectorAll('button');
        for (var i = 0; i < btns.length; i++) {
            var w = parseInt(btns[i].getAttribute('data-w'), 10);
            btns[i].classList.toggle('active', _weekdays.indexOf(w) >= 0);
        }
    }
    function openNoteShare() {
        resetModal();
        var modal = $('todo-modal');
        if (modal) {
            if (typeof window.showModal === 'function') window.showModal(modal);
            else modal.style.display = 'flex';
        }
    }
    function closeNoteShare() {
        var modal = $('todo-modal');
        if (modal) {
            if (typeof window.hideModal === 'function') window.hideModal(modal);
            else modal.style.display = 'none';
        }
    }
    function saveTodo() {
        var name = $('todo-name');
        var text = (name && name.value ? name.value : '').trim();
        if (!text) {
            if (name) { name.focus(); name.style.borderColor = '#e74c3c'; }
            return;
        }
        var timeStr = pad2(_time.h) + ':' + pad2(_time.m);
        var dateStr = $('todo-date') ? $('todo-date').value : '';
        var todo = {
            id: uid(),
            text: text,
            time: timeStr,
            date: dateStr,
            repeat: _repeatSel,
            weekdays: _repeatSel === 'weekly' ? _weekdays.slice().sort(function (a, b) { return a - b; }) : [],
            remind: _remindSel,
            advanceMinutes: _remindSel === 'advance' ? (_adv.h * 60 + _adv.m) : 0
        };
        if (_repeatSel === 'weekly' && _weekdays.length === 0) {
            // 未选任何星期，提示
            var box = $('todo-weekdays');
            if (box) { box.style.outline = '1px solid #e74c3c'; setTimeout(function () { box.style.outline = ''; }, 800); }
            return;
        }
        var list = getTodos();
        list.push(todo);
        saveTodos(list);
        // 若选定日期可见，切到该日期并刷新
        if (dateStr && !(_repeatSel === 'weekly')) {
            var p = String(dateStr).split('-');
            if (p.length === 3) {
                _curYear = parseInt(p[0], 10); _curMonth = parseInt(p[1], 10) - 1;
                _selDate = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
                renderCalendar();
            }
        } else if (_repeatSel === 'weekly' && _selDate) {
            renderCalendar();
        } else {
            renderCalendar();
        }
        renderDesktopCard();
        closeNoteShare();
    }

    // ── 待办提醒：软件内弹窗 + 系统弹窗 ──
    var _fired = {};
    var _remindTimer = null;

    function fireReminder(todo) {
        var pName = (typeof settings !== 'undefined' && settings.partnerName) || '梦角';
        var mName = (typeof settings !== 'undefined' && settings.myName) || '我';
        var title = pName;
        var body = mName + '，' + (todo.text || '待办') + '的时间到了';
        // 1) 软件内弹窗（与消息通知同排版：第一排昵称，第二排内容）
        try {
            if (typeof window.showSystemInfoPopup === 'function') window.showSystemInfoPopup(title, body, {});
        } catch (e) {}
        // 2) 系统弹窗（原生通知：APK / 浏览器自适应，前台也显示）
        try {
            if (typeof PushBridge !== 'undefined' && typeof PushBridge.send === 'function') {
                PushBridge.send(title, body, { inForeground: true, sender: pName });
            }
        } catch (e) {}
    }

    // 返回 todo 在 [from, to] 时间窗口内的所有发生时刻（Date[]），用于提醒判定
    function occurrencesBetween(todo, from, to) {
        var out = [];
        var hm = parseHM(todo.time);
        var H = hm ? hm.h : 9, M = hm ? hm.m : 0;
        var wdSet = weekdaySet(todo);
        if (todo.repeat === 'weekly' && wdSet.length) {
            var d0 = new Date(from); d0.setHours(0, 0, 0, 0);
            for (var i = -1; i <= 9; i++) {
                var d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i, H, M, 0, 0);
                if (wdSet.indexOf(d.getDay()) >= 0 && d.getTime() >= from && d.getTime() <= to) out.push(d);
            }
        } else if (todo.date) {
            var p = String(todo.date).split('-');
            if (p.length === 3) {
                var dt = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10), H, M, 0, 0);
                if (!isNaN(dt.getTime()) && dt.getTime() >= from && dt.getTime() <= to) out.push(dt);
            }
        }
        return out;
    }

    function checkReminders() {
        var now = Date.now();
        var list = getTodos();
        for (var i = 0; i < list.length; i++) {
            var todo = list[i];
            var adv = (todo.remind === 'advance') ? (parseInt(todo.advanceMinutes, 10) || 0) : 0;
            // 提醒时刻 remindAt = 发生时刻 - 提前量；需满足 now-90s < remindAt <= now，
            // 即发生时刻落在 (now + adv - 90s, now + adv] 内（本周待办的发生时刻可能在 now 之前）
            var from = now - 90000 + adv * 60000;
            var to = now + adv * 60000;
            var occs = occurrencesBetween(todo, from, to);
            for (var j = 0; j < occs.length; j++) {
                var remindAt = occs[j].getTime() - adv * 60000;
                if (remindAt <= now && (now - remindAt) < 90000) {
                    var key = todo.id + '@' + remindAt;
                    if (_fired[key]) continue;
                    _fired[key] = true;
                    fireReminder(todo);
                }
            }
        }
        var count = 0;
        for (var k in _fired) { if (Object.prototype.hasOwnProperty.call(_fired, k)) count++; }
        if (count > 500) _fired = {};
    }

    function startReminderLoop() {
        if (_remindTimer) return;
        checkReminders();
        _remindTimer = setInterval(checkReminders, 30000);
    }

    function bindEvents() {
        // 日历容器事件委托
        var grid = $('notes-cal-grid');
        if (grid) {
            grid.addEventListener('click', function (e) {
                var cell = e.target && e.target.closest ? e.target.closest('.np-cal-day') : null;
                if (!cell) return;
                var ymd = cell.getAttribute('data-ymd');
                var p = String(ymd).split('-');
                if (p.length !== 3) return;
                _curYear = parseInt(p[0], 10); _curMonth = parseInt(p[1], 10) - 1;
                _selDate = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
                renderCalendar();
            });
        }
        // 月份切换
        var prev = $('notes-cal-prev');
        if (prev) prev.addEventListener('click', function () {
            _curMonth--; if (_curMonth < 0) { _curMonth = 11; _curYear--; }
            renderCalendar();
        });
        var next = $('notes-cal-next');
        if (next) next.addEventListener('click', function () {
            _curMonth++; if (_curMonth > 11) { _curMonth = 0; _curYear++; }
            renderCalendar();
        });
        // 待办删除
        var dayList = $('notes-day-list');
        if (dayList) {
            dayList.addEventListener('click', function (e) {
                var btn = e.target && e.target.closest ? e.target.closest('.np-todo-del') : null;
                if (!btn) return;
                var id = btn.getAttribute('data-id');
                var list = getTodos().filter(function (t) { return t.id !== id; });
                saveTodos(list);
                renderCalendar();
                renderDesktopCard();
            });
        }
        // 变单弹窗：分段按钮
        var repSeg = $('todo-repeat-seg');
        if (repSeg) repSeg.addEventListener('click', function (e) {
            var b = e.target && e.target.closest ? e.target.closest('button') : null;
            if (!b) return;
            _repeatSel = b.getAttribute('data-v');
            _setSeg('todo-repeat-seg', _repeatSel);
            _refreshRepeatSub();
        });
        var remSeg = $('todo-remind-seg');
        if (remSeg) remSeg.addEventListener('click', function (e) {
            var b = e.target && e.target.closest ? e.target.closest('button') : null;
            if (!b) return;
            _remindSel = b.getAttribute('data-v');
            _setSeg('todo-remind-seg', _remindSel);
            _refreshRemindSub();
        });
        // 星期多选
        var wdBox = $('todo-weekdays');
        if (wdBox) wdBox.addEventListener('click', function (e) {
            var b = e.target && e.target.closest ? e.target.closest('button') : null;
            if (!b) return;
            var w = parseInt(b.getAttribute('data-w'), 10);
            var idx = _weekdays.indexOf(w);
            if (idx >= 0) _weekdays.splice(idx, 1); else _weekdays.push(w);
            _syncWeekdayChips();
        });
        // 保存 / 取消
        var cancel = $('todo-cancel');
        if (cancel) cancel.addEventListener('click', closeNoteShare);
        var save = $('todo-save');
        if (save) save.addEventListener('click', saveTodo);
        // 点击遮罩关闭
        var modal = $('todo-modal');
        if (modal) modal.addEventListener('click', function (e) {
            if (e.target === modal) closeNoteShare();
        });
    }

    // ── 挂载到 window，并 hook 打开函数 ──
    function onShow() { renderNotesPage(); }
    window.NotesApp = {
        render: renderNotesPage,
        renderDesktopCard: renderDesktopCard,
        upcoming: upcoming,
        getTodos: getTodos,
        onShow: onShow
    };
    window.openNotesAdd = openNoteShare;

    // 包一层 openNotesPage，打开时渲染日历
    var _origOpenNotes = window.openNotesPage;
    window.openNotesPage = function () {
        if (_origOpenNotes) _origOpenNotes();
        onShow();
    };

    // 初始化：绑定事件 + 首次渲染
    function init() {
        bindEvents();
        renderDesktopCard();
        renderNotesPage();
        startReminderLoop();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();