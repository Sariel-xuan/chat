/**
 * ═══════════════════════════════════════════════════════════════════
 * Safari 低版本 / Android 旧版 WebView 运行时兼容补丁
 * ───────────────────────────────────────────────────────────────────
 * 核心功能：
 * 1. 检测 flexbox gap 支持情况，不支持时自动注入 margin 回退
 * 2. 检测 inset 简写支持，不支持时处理内联样式中的 inset
 * 3. 检测 aspect-ratio 支持，不支持时处理内联样式中的 aspect-ratio
 * 4. MutationObserver 监听动态插入的元素
 *
 * 加载时机：在 <head> 中同步加载（defer），确保首屏渲染前生效
 * ═══════════════════════════════════════════════════════════════════
 */
(function () {
    'use strict';

    /* ───────────────────────────────────────────────────────────────
       特性检测
       ─────────────────────────────────────────────────────────────── */

    /**
     * 检测浏览器是否支持 flexbox gap
     * 旧版 Safari (<14.1) / Chrome (<84) 支持 Grid gap 但不支持 Flex gap
     */
    function detectFlexGapSupport() {
        if (!window.CSS || !CSS.supports) return false;
        // 先检查是否支持 gap 属性本身
        if (!CSS.supports('gap', '10px')) return false;
        // 再检测 flex 上下文中是否生效
        try {
            var test = document.createElement('div');
            test.style.cssText = 'display:flex;gap:10px;visibility:hidden;position:absolute;width:100px;';
            var a = document.createElement('div');
            a.style.cssText = 'width:10px;height:10px;';
            var b = a.cloneNode(true);
            test.appendChild(a);
            test.appendChild(b);
            document.documentElement.appendChild(test);
            // gap 生效时第二个元素会偏移 10px 以上
            var offset = b.offsetLeft - (a.offsetLeft + a.offsetWidth);
            document.documentElement.removeChild(test);
            return offset >= 8; // 容差
        } catch (e) {
            return false;
        }
    }

    /**
     * 检测是否支持 inset 简写
     */
    function detectInsetSupport() {
        if (!window.CSS || !CSS.supports) return true; // 无法检测时不做处理
        return CSS.supports('inset', '0');
    }

    /**
     * 检测是否支持 aspect-ratio
     */
    function detectAspectRatioSupport() {
        if (!window.CSS || !CSS.supports) return true;
        return CSS.supports('aspect-ratio', '1 / 1');
    }

    var supportsFlexGap = detectFlexGapSupport();
    var supportsInset = detectInsetSupport();
    var supportsAspectRatio = detectAspectRatioSupport();

    // 如果全部支持，不需要任何处理
    if (supportsFlexGap && supportsInset && supportsAspectRatio) {
        return;
    }

    // 标记到 html 元素，供 CSS 层面使用
    if (!supportsFlexGap) {
        document.documentElement.setAttribute('data-noflexgap', '1');
    }
    if (!supportsInset) {
        document.documentElement.setAttribute('data-noinset', '1');
    }
    if (!supportsAspectRatio) {
        document.documentElement.setAttribute('data-noaspectratio', '1');
    }


    /* ───────────────────────────────────────────────────────────────
       1. Flexbox Gap 回退
       ─────────────────────────────────────────────────────────────── */

    /**
     * 解析 gap 值，返回像素值或 null
     * 支持格式：10px / 10px 20px / normal
     */
    function parseGapValue(gapStr) {
        if (!gapStr || gapStr === 'normal' || gapStr === '0px') return null;
        var parts = gapStr.trim().split(/\s+/);
        var rowGap = parts[0];
        var colGap = parts.length > 1 ? parts[1] : parts[0];
        // 只处理像素值和 rem 值
        var rowVal = toPx(rowGap);
        var colVal = toPx(colGap);
        if (rowVal === null && colVal === null) return null;
        return {
            row: rowVal,
            col: colVal
        };
    }

    /**
     * 将 CSS 值转为像素数值
     */
    function toPx(val) {
        if (!val) return null;
        val = val.trim();
        if (val.endsWith('px')) {
            return parseFloat(val);
        }
        if (val.endsWith('rem')) {
            var rem = parseFloat(val);
            var fontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
            return rem * fontSize;
        }
        if (val.endsWith('em')) {
            // em 需要上下文，这里返回 null 让 margin 方式处理
            return null;
        }
        // 纯数字也按 px 处理
        var num = parseFloat(val);
        if (!isNaN(num)) return num;
        return null;
    }

    /**
     * 判断元素是否为 flex 或 inline-flex 布局
     */
    function isFlexContainer(el) {
        var display = el.style.display || getComputedStyle(el).display;
        return display === 'flex' || display === 'inline-flex' ||
               display === '-webkit-flex' || display === '-ms-flexbox' || display === '-ms-inline-flexbox';
    }

    /**
     * 判断 flex-direction 是否为 row（含 row-reverse）
     */
    function isFlexRow(el) {
        var dir = el.style.flexDirection || getComputedStyle(el).flexDirection;
        return dir === 'row' || dir === 'row-reverse' || dir === '';
    }

    /**
     * 为不支持 flex gap 的容器注入 margin 回退
     * 策略：为第 2+ 个子元素添加 margin-top（column）或 margin-left（row）
     */
    function applyFlexGapFallback(el) {
        if (el.getAttribute('data-gap-fixed')) return;

        var style = getComputedStyle(el);
        var gapStr = style.gap || style.rowGap;
        if (!gapStr || gapStr === 'normal' || gapStr === '0px') {
            // 也检查 rowGap/columnGap 属性
            var rg = style.rowGap;
            var cg = style.columnGap;
            if ((!rg || rg === 'normal' || rg === '0px') && (!cg || cg === 'normal' || cg === '0px')) {
                return;
            }
            gapStr = (rg !== 'normal' && rg !== '0px') ? rg : cg;
        }

        var parsed = parseGapValue(gapStr);
        if (!parsed) return;

        var isRow = isFlexRow(el);
        var children = el.children;
        if (children.length < 2) return;

        // 检查是否已经由 CSS @supports 回退处理过
        if (el.getAttribute('data-css-gap-fixed')) return;

        var gapPx = isRow ? parsed.col : parsed.row;
        if (gapPx === null || gapPx === 0) {
            // 如果主轴方向的 gap 解析失败，尝试另一个
            gapPx = isRow ? parsed.row : parsed.col;
            if (gapPx === null || gapPx === 0) return;
        }

        // 标记已处理
        el.setAttribute('data-gap-fixed', '1');

        // 为第 2+ 个子元素添加 margin
        for (var i = 1; i < children.length; i++) {
            var child = children[i];
            if (child.nodeType !== 1) continue;
            // 跳过绝对定位的子元素（它们不参与 flex 流）
            var childPos = getComputedStyle(child).position;
            if (childPos === 'absolute' || childPos === 'fixed') continue;

            if (isRow) {
                // row 方向：margin-left
                // 考虑 flex-direction: row-reverse 时用 margin-right
                var dir = el.style.flexDirection || getComputedStyle(el).flexDirection;
                if (dir === 'row-reverse') {
                    child.style.marginRight = (parseFloat(child.style.marginRight) || 0) + gapPx + 'px';
                } else {
                    child.style.marginLeft = (parseFloat(child.style.marginLeft) || 0) + gapPx + 'px';
                }
            } else {
                // column 方向：margin-top
                var dir2 = el.style.flexDirection || getComputedStyle(el).flexDirection;
                if (dir2 === 'column-reverse') {
                    child.style.marginBottom = (parseFloat(child.style.marginBottom) || 0) + gapPx + 'px';
                } else {
                    child.style.marginTop = (parseFloat(child.style.marginTop) || 0) + gapPx + 'px';
                }
            }
        }
    }

    /**
     * 批量处理容器内所有 flex 元素的 gap 回退
     */
    function processFlexGaps(root) {
        if (supportsFlexGap) return;
        root = root || document;
        // 优先处理带 gap 内联样式的元素
        var inlineGapEls = root.querySelectorAll('[style*="gap"]');
        for (var i = 0; i < inlineGapEls.length; i++) {
            if (isFlexContainer(inlineGapEls[i])) {
                applyFlexGapFallback(inlineGapEls[i]);
            }
        }

        // 处理所有 flex 容器（检查计算样式中是否有 gap）
        // 用 querySelectorAll('*') 太重，改为只查找常见容器
        var flexContainers = root.querySelectorAll(
            '.app-cell, .dt-content, .dt-p3-body, .dt-p3-grid, .dt-p3-card, .dt-p3-info, ' +
            '.dt-p3-notes, .dt-p3-note, .dt-anniversary, .dt-ann-meta, .pl-slot, .pl-slot-head, ' +
            '.header, .input-area, .chat-container, .modal, .modal-content, ' +
            '.cs-couple-row, .cs-topbar, .env-tab-bar, .app-grid, ' +
            '.companion-page, .companion-header, [class*="flex"], [class*="row"], [class*="bar"]'
        );
        for (var j = 0; j < flexContainers.length; j++) {
            applyFlexGapFallback(flexContainers[j]);
        }

        // 最后兜底：查找所有 display:flex 的元素
        var allEls = root.querySelectorAll('*');
        for (var k = 0; k < allEls.length; k++) {
            var el = allEls[k];
            if (el.children.length < 2) continue;
            if (el.getAttribute('data-gap-fixed')) continue;
            var disp = getComputedStyle(el).display;
            if (disp === 'flex' || disp === 'inline-flex') {
                applyFlexGapFallback(el);
            }
        }
    }


    /* ───────────────────────────────────────────────────────────────
       2. 内联样式 inset 回退
       ─────────────────────────────────────────────────────────────── */

    /**
     * 处理内联样式中的 inset 属性
     * 仅处理 inset: 0 和 inset: Npx 的简单情况
     */
    function processInlineInset(root) {
        if (supportsInset) return;
        root = root || document;
        var els = root.querySelectorAll('[style*="inset"]');
        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            var style = el.style;
            var insetVal = style.inset || style.getPropertyValue('inset');
            if (!insetVal) continue;

            // 已有 top/right/bottom/left 时不覆盖
            if (style.top || style.right || style.bottom || style.left) continue;

            var parts = insetVal.trim().split(/\s+/);
            if (parts.length === 1) {
                var v = parts[0];
                el.style.top = v;
                el.style.right = v;
                el.style.bottom = v;
                el.style.left = v;
            } else if (parts.length === 2) {
                el.style.top = parts[0];
                el.style.bottom = parts[0];
                el.style.left = parts[1];
                el.style.right = parts[1];
            }
        }
    }


    /* ───────────────────────────────────────────────────────────────
       3. 内联样式 aspect-ratio 回退
       ─────────────────────────────────────────────────────────────── */

    /**
     * 处理内联样式中的 aspect-ratio 属性
     * 使用 padding-bottom hack
     */
    function processInlineAspectRatio(root) {
        if (supportsAspectRatio) return;
        root = root || document;
        var els = root.querySelectorAll('[style*="aspect-ratio"]');
        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            var style = el.style;
            var ratio = style.aspectRatio || style.getPropertyValue('aspect-ratio');
            if (!ratio) continue;

            // 解析比例
            var parts = ratio.trim().split(/[/\s]+/);
            var w, h;
            if (parts.length === 1) {
                w = 1; h = parseFloat(parts[0]);
                if (!h) { w = parseFloat(parts[0]); h = 1; }
            } else {
                w = parseFloat(parts[0]);
                h = parseFloat(parts[1]);
            }
            if (!w || !h) continue;

            // padding-bottom 百分比 = 高 / 宽 * 100
            var pct = (h / w) * 100;
            el.style.position = 'relative';
            el.style.height = '0';
            el.style.paddingBottom = pct + '%';

            // 将子元素设为绝对定位以填满容器
            // 注意：这可能影响某些布局，仅在容器有子元素时处理
            var children = el.children;
            for (var j = 0; j < children.length; j++) {
                var child = children[j];
                if (getComputedStyle(child).position === 'static') {
                    child.style.position = 'absolute';
                    child.style.top = '0';
                    child.style.left = '0';
                    child.style.width = '100%';
                    child.style.height = '100%';
                }
            }
        }
    }


    /* ───────────────────────────────────────────────────────────────
       4. :has() 回退 — 为需要 :has 的元素添加类名
       ─────────────────────────────────────────────────────────────── */

    /**
     * 检测 :has() 支持
     */
    function detectHasSupport() {
        try {
            return CSS.supports('selector(:has(*))');
        } catch (e) {
            return false;
        }
    }

    /**
     * 为使用 :has(input:checked) 的元素添加回退类名
     */
    function processHasFallback(root) {
        if (detectHasSupport()) return;
        root = root || document;

        // .export-row:has(input:checked)
        var exportRows = root.querySelectorAll('.export-row');
        for (var i = 0; i < exportRows.length; i++) {
            var checked = exportRows[i].querySelector('input:checked');
            if (checked) {
                exportRows[i].classList.add('has-checked');
            } else {
                exportRows[i].classList.remove('has-checked');
            }
        }

        // .dm-row-item:has(.dm-danger-btn)
        var dmRows = root.querySelectorAll('.dm-row-item');
        for (var j = 0; j < dmRows.length; j++) {
            var danger = dmRows[j].querySelector('.dm-danger-btn');
            if (danger) {
                dmRows[j].classList.add('has-danger');
            }
        }
    }


    /* ───────────────────────────────────────────────────────────────
       初始化 & MutationObserver
       ─────────────────────────────────────────────────────────────── */

    var isProcessing = false;
    var pendingNodes = [];

    function processNode(node) {
        if (node.nodeType !== 1) return;
        if (!supportsFlexGap) {
            applyFlexGapFallback(node);
            // 也处理子元素
            var flexChildren = node.querySelectorAll('[style*="gap"]');
            for (var i = 0; i < flexChildren.length; i++) {
                if (isFlexContainer(flexChildren[i])) {
                    applyFlexGapFallback(flexChildren[i]);
                }
            }
        }
        if (!supportsInset) {
            processInlineInset(node);
        }
        if (!supportsAspectRatio) {
            processInlineAspectRatio(node);
        }
        processHasFallback(node);
    }

    function flushPending() {
        if (isProcessing || pendingNodes.length === 0) return;
        isProcessing = true;
        var batch = pendingNodes.splice(0, 100);
        for (var i = 0; i < batch.length; i++) {
            try {
                processNode(batch[i]);
            } catch (e) {
                // 忽略单个元素处理失败
            }
        }
        isProcessing = false;
    }

    function init() {
        // 首次全量处理
        processFlexGaps(document);
        processInlineInset(document);
        processInlineAspectRatio(document);
        processHasFallback(document);

        // MutationObserver：监听动态插入的元素
        if (typeof MutationObserver !== 'undefined') {
            var observer = new MutationObserver(function (mutations) {
                for (var i = 0; i < mutations.length; i++) {
                    var mutation = mutations[i];
                    if (mutation.type === 'childList') {
                        for (var j = 0; j < mutation.addedNodes.length; j++) {
                            var node = mutation.addedNodes[j];
                            if (node.nodeType === 1) {
                                pendingNodes.push(node);
                                // 也处理子树
                                var descendants = node.querySelectorAll ? node.querySelectorAll('*') : [];
                                for (var k = 0; k < descendants.length; k++) {
                                    pendingNodes.push(descendants[k]);
                                }
                            }
                        }
                    } else if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                        pendingNodes.push(mutation.target);
                    }
                }
                // 节流处理
                if (pendingNodes.length > 0) {
                    if (typeof requestAnimationFrame !== 'undefined') {
                        requestAnimationFrame(flushPending);
                    } else {
                        setTimeout(flushPending, 16);
                    }
                }
            });
            observer.observe(document.body || document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class']
            });
        }
    }

    // 在 DOM 就绪后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // 已经就绪
        init();
    }

    // 在 load 后再跑一次，确保所有延迟加载的内容都被处理
    window.addEventListener('load', function () {
        setTimeout(function () {
            processFlexGaps(document);
            processInlineInset(document);
            processInlineAspectRatio(document);
            processHasFallback(document);
        }, 100);
    });

})();
