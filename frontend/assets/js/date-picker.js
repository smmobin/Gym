(function () {
  "use strict";

  var FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  var MONTHS = [
    "فروردین",
    "اردیبهشت",
    "خرداد",
    "تیر",
    "مرداد",
    "شهریور",
    "مهر",
    "آبان",
    "آذر",
    "دی",
    "بهمن",
    "اسفند",
  ];
  var WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
  /** Years shown per page in the year picker (same footprint as the day grid). */
  var YEAR_PAGE_SIZE = 12;
  /** Browseable Jalali year span relative to today's year. */
  var YEAR_RANGE_PAST = 80;
  var YEAR_RANGE_FUTURE = 40;

  function toFaDigits(value) {
    return String(value).replace(/\d/g, function (d) {
      return FA_DIGITS[Number(d)];
    });
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function div(a, b) {
    return Math.trunc(a / b);
  }

  function isJalaliLeap(jy) {
    var breaks = [
      -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324,
      2394, 2456, 3178,
    ];
    var jp = breaks[0];
    var jump = 0;
    for (var i = 1; i < breaks.length; i += 1) {
      var jm = breaks[i];
      jump = jm - jp;
      if (jy < jm) break;
      jp = jm;
    }
    var n = jy - jp;
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    var leap = ((((n + 1) % 33) - 1) % 4);
    if (leap === -1) leap = 4;
    return leap === 0;
  }

  function jalaliMonthLength(jy, jm) {
    if (jm <= 6) return 31;
    if (jm <= 11) return 30;
    return isJalaliLeap(jy) ? 30 : 29;
  }

  function gregorianToJalali(gy, gm, gd) {
    var g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    var gy2 = gm > 2 ? gy + 1 : gy;
    var days =
      355666 +
      365 * gy +
      div(gy2 + 3, 4) -
      div(gy2 + 99, 100) +
      div(gy2 + 399, 400) +
      gd +
      g_d_m[gm - 1];
    var jy = -1595 + 33 * div(days, 12053);
    days %= 12053;
    jy += 4 * div(days, 1461);
    days %= 1461;
    if (days > 365) {
      jy += div(days - 1, 365);
      days = (days - 1) % 365;
    }
    var jm;
    var jd;
    if (days < 186) {
      jm = 1 + div(days, 31);
      jd = 1 + (days % 31);
    } else {
      jm = 7 + div(days - 186, 30);
      jd = 1 + ((days - 186) % 30);
    }
    return [jy, jm, jd];
  }

  function jalaliToGregorian(jy, jm, jd) {
    var jy2 = jy + 1595;
    var days =
      -355668 +
      365 * jy2 +
      div(jy2, 33) * 8 +
      div((jy2 % 33) + 3, 4) +
      jd +
      (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
    var gy = 400 * div(days, 146097);
    days %= 146097;
    if (days > 36524) {
      days -= 1;
      gy += 100 * div(days, 36524);
      days %= 36524;
      if (days >= 365) days += 1;
    }
    gy += 4 * div(days, 1461);
    days %= 1461;
    if (days > 365) {
      gy += div(days - 1, 365);
      days = (days - 1) % 365;
    }
    var gd = days + 1;
    var sal_a = [
      0,
      31,
      (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31,
    ];
    var gm = 0;
    for (gm = 1; gm <= 12 && gd > sal_a[gm]; gm += 1) gd -= sal_a[gm];
    return [gy, gm, gd];
  }

  function saturdayIndex(gy, gm, gd) {
    return (new Date(gy, gm - 1, gd).getDay() + 1) % 7;
  }

  function parseDateTimeLocal(value) {
    var m = String(value || "")
      .trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (!m) return null;
    return {
      y: Number(m[1]),
      m: Number(m[2]),
      d: Number(m[3]),
      hour: m[4] != null ? Number(m[4]) : 0,
      minute: m[5] != null ? Number(m[5]) : 0,
    };
  }

  function formatIsoDate(y, m, d) {
    return y + "-" + pad2(m) + "-" + pad2(d);
  }

  function formatDateTimeLocal(y, m, d, hour, minute) {
    return formatIsoDate(y, m, d) + "T" + pad2(hour) + ":" + pad2(minute);
  }

  function displayJalali(gy, gm, gd) {
    var j = gregorianToJalali(gy, gm, gd);
    return toFaDigits(j[2] + " " + MONTHS[j[1] - 1] + " " + j[0]);
  }

  function displayJalaliDateTime(gy, gm, gd, hour, minute) {
    return displayJalali(gy, gm, gd) + " · " + toFaDigits(pad2(hour) + ":" + pad2(minute));
  }

  function todayParts() {
    var now = new Date();
    return {
      y: now.getFullYear(),
      m: now.getMonth() + 1,
      d: now.getDate(),
      hour: now.getHours(),
      minute: now.getMinutes(),
    };
  }

  function closeOtherOverlays(except) {
    document.querySelectorAll("[data-date-picker].is-open").forEach(function (other) {
      if (other === except) return;
      other.classList.remove("is-open");
      var pop = other.querySelector(".date-picker-pop");
      var t = other.querySelector(".date-picker-trigger");
      if (pop) pop.hidden = true;
      if (t) t.setAttribute("aria-expanded", "false");
    });
    document.querySelectorAll("[data-time-picker].is-open").forEach(function (tp) {
      tp.classList.remove("is-open");
      var pop = tp.querySelector(".time-picker-pop");
      var t = tp.querySelector(".time-picker-trigger");
      if (pop) pop.hidden = true;
      if (t) t.setAttribute("aria-expanded", "false");
    });
    document.querySelectorAll("[data-custom-select].is-open").forEach(function (sel) {
      sel.classList.remove("is-open");
      var menu = sel.querySelector(".custom-select-menu");
      var t = sel.querySelector(".custom-select-trigger");
      if (menu) menu.hidden = true;
      if (t) t.setAttribute("aria-expanded", "false");
    });
  }

  function enhanceDateInput(input) {
    if (!input || input.dataset.dateEnhanced === "1") return;
    if (input.closest("[data-date-picker]")) return;
    if (input.readOnly || input.disabled) return;
    if (input.type !== "date" && input.type !== "datetime-local") return;
    if (!input.parentNode) return;

    var withTime = input.type === "datetime-local";
    var parsed = parseDateTimeLocal(input.value) || todayParts();
    var state = {
      y: parsed.y,
      m: parsed.m,
      d: parsed.d,
      hour: parsed.hour || 0,
      minute: parsed.minute || 0,
      viewJy: 0,
      viewJm: 0,
      /** @type {'days'|'months'|'years'} */
      navMode: "days",
      yearPageStart: 0,
    };
    var j0 = gregorianToJalali(state.y, state.m, state.d);
    state.viewJy = j0[0];
    state.viewJm = j0[1];

    var root = document.createElement("div");
    root.className = "date-picker" + (withTime ? " has-time" : "");
    root.setAttribute("data-date-picker", "");

    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "date-picker-trigger";
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");

    var icon = document.createElement("span");
    icon.className = "date-picker-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M8 3.5v3M16 3.5v3M3.5 10h17"/></svg>';

    var valueEl = document.createElement("span");
    valueEl.className = "date-picker-value";

    var chevron = document.createElement("span");
    chevron.className = "date-picker-chevron";
    chevron.setAttribute("aria-hidden", "true");

    trigger.appendChild(icon);
    trigger.appendChild(valueEl);
    trigger.appendChild(chevron);

    var pop = document.createElement("div");
    pop.className = "date-picker-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", withTime ? "انتخاب تاریخ و ساعت" : "انتخاب تاریخ");
    pop.hidden = true;

    var hero = document.createElement("div");
    hero.className = "date-picker-hero";
    var heroLabel = document.createElement("span");
    heroLabel.className = "date-picker-hero-label";
    heroLabel.textContent = withTime ? "تاریخ و ساعت" : "تاریخ انتخاب‌شده";
    var heroValue = document.createElement("div");
    heroValue.className = "date-picker-hero-value";
    hero.appendChild(heroLabel);
    hero.appendChild(heroValue);

    var nav = document.createElement("div");
    nav.className = "date-picker-nav";
    var prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "date-picker-nav-btn";
    prevBtn.setAttribute("aria-label", "ماه قبل");
    prevBtn.textContent = "‹";
    var title = document.createElement("div");
    title.className = "date-picker-nav-title";
    var monthBtn = document.createElement("button");
    monthBtn.type = "button";
    monthBtn.className = "date-picker-nav-part date-picker-nav-month";
    monthBtn.setAttribute("aria-label", "انتخاب ماه");
    var yearBtn = document.createElement("button");
    yearBtn.type = "button";
    yearBtn.className = "date-picker-nav-part date-picker-nav-year";
    yearBtn.setAttribute("aria-label", "انتخاب سال");
    title.appendChild(monthBtn);
    title.appendChild(yearBtn);
    var nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "date-picker-nav-btn";
    nextBtn.setAttribute("aria-label", "ماه بعد");
    nextBtn.textContent = "›";
    nav.appendChild(prevBtn);
    nav.appendChild(title);
    nav.appendChild(nextBtn);

    var week = document.createElement("div");
    week.className = "date-picker-week";
    WEEKDAYS.forEach(function (w) {
      var cell = document.createElement("span");
      cell.textContent = w;
      week.appendChild(cell);
    });

    var grid = document.createElement("div");
    grid.className = "date-picker-grid";

    var monthPanel = document.createElement("div");
    monthPanel.className = "date-picker-months";
    monthPanel.hidden = true;
    monthPanel.setAttribute("role", "listbox");
    monthPanel.setAttribute("aria-label", "ماه");

    var yearPanel = document.createElement("div");
    yearPanel.className = "date-picker-years";
    yearPanel.hidden = true;
    yearPanel.setAttribute("role", "listbox");
    yearPanel.setAttribute("aria-label", "سال");

    var timeBlock = null;
    var hourValueEl = null;
    var minuteValueEl = null;
    if (withTime) {
      timeBlock = document.createElement("div");
      timeBlock.className = "date-picker-time";

      function buildStepper(kind, labelText) {
        var wrap = document.createElement("div");
        wrap.className = "date-picker-stepper";
        var lab = document.createElement("span");
        lab.className = "date-picker-time-label";
        lab.textContent = labelText;
        var row = document.createElement("div");
        row.className = "date-picker-stepper-row";
        var minus = document.createElement("button");
        minus.type = "button";
        minus.className = "date-picker-step-btn";
        minus.dataset.kind = kind;
        minus.dataset.delta = "-1";
        minus.textContent = "−";
        var val = document.createElement("span");
        val.className = "date-picker-step-value";
        val.dataset.kind = kind;
        var plus = document.createElement("button");
        plus.type = "button";
        plus.className = "date-picker-step-btn";
        plus.dataset.kind = kind;
        plus.dataset.delta = "1";
        plus.textContent = "+";
        row.appendChild(minus);
        row.appendChild(val);
        row.appendChild(plus);
        wrap.appendChild(lab);
        wrap.appendChild(row);
        return { wrap: wrap, val: val };
      }

      var hourStep = buildStepper("hour", "ساعت");
      var minuteStep = buildStepper("minute", "دقیقه");
      hourValueEl = hourStep.val;
      minuteValueEl = minuteStep.val;
      timeBlock.appendChild(hourStep.wrap);
      timeBlock.appendChild(minuteStep.wrap);
    }

    var actions = document.createElement("div");
    actions.className = "date-picker-actions";
    var todayBtn = document.createElement("button");
    todayBtn.type = "button";
    todayBtn.className = "btn ghost small";
    todayBtn.textContent = "امروز";
    actions.appendChild(todayBtn);

    var errEl = document.createElement("p");
    errEl.className = "date-picker-error";
    errEl.hidden = true;
    errEl.setAttribute("role", "alert");

    pop.appendChild(hero);
    pop.appendChild(nav);
    pop.appendChild(week);
    pop.appendChild(grid);
    pop.appendChild(monthPanel);
    pop.appendChild(yearPanel);
    if (timeBlock) pop.appendChild(timeBlock);
    pop.appendChild(errEl);
    pop.appendChild(actions);

    input.classList.add("date-picker-native");
    input.tabIndex = -1;
    input.setAttribute("aria-hidden", "true");
    input.dataset.dateEnhanced = "1";

    // Keep a stable ISO/text value for FormData. Native type=date is unreliable
    // with custom UI (label focus, empty serialization, browser calendar).
    var initialValue = input.value;
    try {
      input.type = "hidden";
    } catch (err) {
      /* some browsers block type changes; keep original */
    }
    if (initialValue) {
      input.value = initialValue;
      input.setAttribute("value", initialValue);
    }

    input.parentNode.insertBefore(root, input);
    root.appendChild(input);
    root.appendChild(trigger);
    root.appendChild(pop);

    function jalaliYearBounds() {
      var t = todayParts();
      var tj = gregorianToJalali(t.y, t.m, t.d);
      var anchor = tj[0];
      return {
        min: Math.max(1, anchor - YEAR_RANGE_PAST),
        max: anchor + YEAR_RANGE_FUTURE,
      };
    }

    function alignYearPageStart(jy) {
      var b = jalaliYearBounds();
      var y = Math.min(Math.max(jy, b.min), b.max);
      var lastPage = b.min + Math.floor((b.max - b.min) / YEAR_PAGE_SIZE) * YEAR_PAGE_SIZE;
      var start = b.min + Math.floor((y - b.min) / YEAR_PAGE_SIZE) * YEAR_PAGE_SIZE;
      if (start > lastPage) start = lastPage;
      return start;
    }

    function syncNavChrome() {
      var bounds = jalaliYearBounds();
      monthBtn.textContent = MONTHS[state.viewJm - 1];
      yearBtn.textContent = toFaDigits(String(state.viewJy));
      monthBtn.classList.toggle("is-active", state.navMode === "months");
      yearBtn.classList.toggle("is-active", state.navMode === "years");
      monthBtn.hidden = state.navMode === "years";
      if (state.navMode === "years") {
        var endY = Math.min(state.yearPageStart + YEAR_PAGE_SIZE - 1, bounds.max);
        yearBtn.textContent =
          toFaDigits(String(state.yearPageStart)) + "–" + toFaDigits(String(endY));
      }
      prevBtn.setAttribute(
        "aria-label",
        state.navMode === "years" ? "صفحهٔ سال قبل" : state.navMode === "months" ? "سال قبل" : "ماه قبل",
      );
      nextBtn.setAttribute(
        "aria-label",
        state.navMode === "years" ? "صفحهٔ سال بعد" : state.navMode === "months" ? "سال بعد" : "ماه بعد",
      );
      if (state.navMode === "years") {
        prevBtn.disabled = state.yearPageStart <= bounds.min;
        nextBtn.disabled = state.yearPageStart + YEAR_PAGE_SIZE > bounds.max;
      } else {
        prevBtn.disabled = false;
        nextBtn.disabled = false;
      }
      week.hidden = state.navMode !== "days";
      grid.hidden = state.navMode !== "days";
      monthPanel.hidden = state.navMode !== "months";
      yearPanel.hidden = state.navMode !== "years";
      pop.classList.toggle("is-picking-month", state.navMode === "months");
      pop.classList.toggle("is-picking-year", state.navMode === "years");
    }

    function syncDisplay() {
      if (withTime) {
        valueEl.textContent = displayJalaliDateTime(state.y, state.m, state.d, state.hour, state.minute);
        heroValue.textContent = displayJalaliDateTime(state.y, state.m, state.d, state.hour, state.minute);
      } else {
        valueEl.textContent = displayJalali(state.y, state.m, state.d);
        heroValue.textContent = displayJalali(state.y, state.m, state.d);
      }
      syncNavChrome();
      if (hourValueEl) hourValueEl.textContent = toFaDigits(pad2(state.hour));
      if (minuteValueEl) minuteValueEl.textContent = toFaDigits(pad2(state.minute));
    }

    function ensureYearPageContains(jy) {
      state.yearPageStart = alignYearPageStart(jy);
    }

    function setNavMode(mode) {
      state.navMode = mode;
      if (mode === "years") ensureYearPageContains(state.viewJy);
      syncNavChrome();
      if (mode === "days") renderGrid();
      else if (mode === "months") renderMonths();
      else renderYears();
    }

    function renderGrid() {
      grid.innerHTML = "";
      var len = jalaliMonthLength(state.viewJy, state.viewJm);
      var firstG = jalaliToGregorian(state.viewJy, state.viewJm, 1);
      var start = saturdayIndex(firstG[0], firstG[1], firstG[2]);
      var selectedJ = gregorianToJalali(state.y, state.m, state.d);
      var today = todayParts();
      var todayJ = gregorianToJalali(today.y, today.m, today.d);

      for (var i = 0; i < start; i += 1) {
        var blank = document.createElement("span");
        blank.className = "date-picker-day is-blank";
        grid.appendChild(blank);
      }

      for (var day = 1; day <= len; day += 1) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "date-picker-day";
        btn.textContent = toFaDigits(String(day));
        btn.dataset.day = String(day);
        if (selectedJ[0] === state.viewJy && selectedJ[1] === state.viewJm && selectedJ[2] === day) {
          btn.classList.add("is-selected");
        }
        if (todayJ[0] === state.viewJy && todayJ[1] === state.viewJm && todayJ[2] === day) {
          btn.classList.add("is-today");
        }
        grid.appendChild(btn);
      }
    }

    function renderMonths() {
      monthPanel.innerHTML = "";
      var selectedJ = gregorianToJalali(state.y, state.m, state.d);
      for (var m = 1; m <= 12; m += 1) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "date-picker-month";
        btn.textContent = MONTHS[m - 1];
        btn.dataset.month = String(m);
        btn.setAttribute("role", "option");
        if (m === state.viewJm) btn.classList.add("is-view");
        if (selectedJ[0] === state.viewJy && selectedJ[1] === m) btn.classList.add("is-selected");
        monthPanel.appendChild(btn);
      }
    }

    function renderYears() {
      yearPanel.innerHTML = "";
      var bounds = jalaliYearBounds();
      var selectedJ = gregorianToJalali(state.y, state.m, state.d);
      for (var i = 0; i < YEAR_PAGE_SIZE; i += 1) {
        var y = state.yearPageStart + i;
        if (y > bounds.max) break;
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "date-picker-year";
        btn.textContent = toFaDigits(String(y));
        btn.dataset.year = String(y);
        btn.setAttribute("role", "option");
        if (y === state.viewJy) btn.classList.add("is-view");
        if (selectedJ[0] === y) btn.classList.add("is-selected");
        yearPanel.appendChild(btn);
      }
    }

    function pendingValue() {
      return withTime
        ? formatDateTimeLocal(state.y, state.m, state.d, state.hour, state.minute)
        : formatIsoDate(state.y, state.m, state.d);
    }

    function clearCommitError() {
      errEl.hidden = true;
      errEl.textContent = "";
    }

    function showCommitError(message) {
      errEl.textContent = message;
      errEl.hidden = false;
    }

    /**
     * Optional: data-min-datetime-from="starts_at" on پایان —
     * on تأیید, if pending ≤ that field → show error and do not commit (no auto-fix).
     */
    function validateBeforeCommit() {
      clearCommitError();
      var form = input.form || input.closest("form");
      if (!form) return true;
      var pending = pendingValue();
      var pendingDate = new Date(pending);
      if (Number.isNaN(pendingDate.getTime())) return true;

      var minName = input.getAttribute("data-min-datetime-from");
      if (minName) {
        var minEl = form.querySelector('[name="' + minName + '"]');
        if (minEl && minEl.value) {
          var minDate = new Date(minEl.value);
          if (!Number.isNaN(minDate.getTime()) && pendingDate <= minDate) {
            showCommitError("زمان پایان باید بعد از زمان شروع باشد.");
            return false;
          }
        }
      }
      return true;
    }

    function applyToInput() {
      var next = pendingValue();
      var changed = input.value !== next;
      input.value = next;
      // Keep default value in sync so form.reset() restores the last committed date.
      input.setAttribute("value", next);
      input.dataset.isoValue = next;
      if (changed) {
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      syncDisplay();
    }

    root._gymCommitDate = applyToInput;

    function pullFromInput() {
      var p = parseDateTimeLocal(input.value) || todayParts();
      state.y = p.y;
      state.m = p.m;
      state.d = p.d;
      state.hour = p.hour || 0;
      state.minute = p.minute || 0;
      var j = gregorianToJalali(state.y, state.m, state.d);
      state.viewJy = j[0];
      state.viewJm = j[1];
      syncDisplay();
      renderGrid();
    }

    function close() {
      root.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
      pop.hidden = true;
    }

    function open() {
      closeOtherOverlays(root);
      clearCommitError();
      state.navMode = "days";
      pullFromInput();
      root.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      pop.hidden = false;
    }

    function tryCommitAndClose() {
      if (!validateBeforeCommit()) return false;
      applyToInput();
      close();
      return true;
    }

    function pickDay(day) {
      var g = jalaliToGregorian(state.viewJy, state.viewJm, day);
      state.y = g[0];
      state.m = g[1];
      state.d = g[2];
      syncDisplay();
      renderGrid();
      // Apply on day click and always close the panel (no تأیید).
      if (!validateBeforeCommit()) return;
      applyToInput();
      close();
    }

    trigger.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (root.classList.contains("is-open")) {
        tryCommitAndClose();
      } else open();
    });

    prevBtn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (state.navMode === "years") {
        var boundsPrev = jalaliYearBounds();
        state.yearPageStart = alignYearPageStart(
          Math.max(boundsPrev.min, state.yearPageStart - YEAR_PAGE_SIZE),
        );
        syncDisplay();
        renderYears();
        return;
      }
      if (state.navMode === "months") {
        state.viewJy -= 1;
        if (state.viewJy < 1) state.viewJy = 1;
        syncDisplay();
        renderMonths();
        return;
      }
      state.viewJm -= 1;
      if (state.viewJm < 1) {
        state.viewJm = 12;
        state.viewJy -= 1;
      }
      syncDisplay();
      renderGrid();
    });

    nextBtn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (state.navMode === "years") {
        var boundsNext = jalaliYearBounds();
        state.yearPageStart = alignYearPageStart(
          Math.min(boundsNext.max, state.yearPageStart + YEAR_PAGE_SIZE),
        );
        syncDisplay();
        renderYears();
        return;
      }
      if (state.navMode === "months") {
        state.viewJy += 1;
        syncDisplay();
        renderMonths();
        return;
      }
      state.viewJm += 1;
      if (state.viewJm > 12) {
        state.viewJm = 1;
        state.viewJy += 1;
      }
      syncDisplay();
      renderGrid();
    });

    monthBtn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      setNavMode(state.navMode === "months" ? "days" : "months");
    });

    yearBtn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      setNavMode(state.navMode === "years" ? "days" : "years");
    });

    monthPanel.addEventListener("click", function (event) {
      var btn = event.target.closest(".date-picker-month");
      if (!btn || !monthPanel.contains(btn)) return;
      event.preventDefault();
      event.stopPropagation();
      state.viewJm = Number(btn.dataset.month);
      setNavMode("days");
    });

    yearPanel.addEventListener("click", function (event) {
      var btn = event.target.closest(".date-picker-year");
      if (!btn || !yearPanel.contains(btn)) return;
      event.preventDefault();
      event.stopPropagation();
      state.viewJy = Number(btn.dataset.year);
      setNavMode("months");
    });

    grid.addEventListener("click", function (event) {
      var dayBtn = event.target.closest(".date-picker-day:not(.is-blank)");
      if (!dayBtn || !grid.contains(dayBtn)) return;
      event.preventDefault();
      // Stop before pickDay/renderGrid — otherwise the day button is detached and
      // document click treats it as outside (BUG-006 datetime-local).
      event.stopPropagation();
      clearCommitError();
      pickDay(Number(dayBtn.dataset.day));
    });

    if (timeBlock) {
      timeBlock.addEventListener("click", function (event) {
        var btn = event.target.closest(".date-picker-step-btn");
        if (!btn || !timeBlock.contains(btn)) return;
        event.preventDefault();
        event.stopPropagation();
        clearCommitError();
        var kind = btn.dataset.kind;
        var delta = Number(btn.dataset.delta);
        if (kind === "hour") state.hour = (state.hour + delta + 24) % 24;
        else state.minute = (state.minute + delta + 60) % 60;
        syncDisplay();
        // Live-apply time while open; invalid range (e.g. end ≤ start) keeps previous value.
        if (validateBeforeCommit()) applyToInput();
      });
    }

    todayBtn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      var t = todayParts();
      state.y = t.y;
      state.m = t.m;
      state.d = t.d;
      if (withTime) {
        state.hour = t.hour;
        state.minute = t.minute;
      }
      var j = gregorianToJalali(state.y, state.m, state.d);
      state.viewJy = j[0];
      state.viewJm = j[1];
      syncDisplay();
      renderGrid();
      tryCommitAndClose();
    });

    trigger.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });

    pop.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        // Escape closes without forcing a new commit; last applied value stays.
        pullFromInput();
        syncDisplay();
        close();
        trigger.focus();
      }
    });

    document.addEventListener("click", function (event) {
      if (!root.classList.contains("is-open")) return;
      var target = event.target;
      if (target instanceof Node) {
        if (root.contains(target)) return;
        // Nodes detached mid-handler (e.g. day re-render) are not real outside clicks.
        if (!document.documentElement.contains(target)) return;
      }
      // Outside click: apply current pending value if valid, then close (no انصراف needed).
      if (!validateBeforeCommit()) {
        pullFromInput();
        syncDisplay();
        close();
        return;
      }
      applyToInput();
      close();
    });

    input.addEventListener("change", pullFromInput);

    try {
      var protoDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
      if (protoDesc && protoDesc.get && protoDesc.set) {
        Object.defineProperty(input, "value", {
          configurable: true,
          enumerable: true,
          get: function () {
            return protoDesc.get.call(input);
          },
          set: function (next) {
            protoDesc.set.call(input, next);
            pullFromInput();
          },
        });
      }
    } catch (err) {
      /* ignore */
    }

    pullFromInput();
  }

  function refresh(scope) {
    var root = scope && scope.querySelectorAll ? scope : document;
    root.querySelectorAll('input[type="date"], input[type="datetime-local"]').forEach(enhanceDateInput);
  }

  /** Commit every enhanced date picker inside a form (or document) before FormData/read. */
  function flush(scope) {
    var root = scope && scope.querySelectorAll ? scope : document;
    root.querySelectorAll("[data-date-picker]").forEach(function (el) {
      if (typeof el._gymCommitDate === "function") el._gymCommitDate();
    });
  }

  function init() {
    refresh(document);
    document.addEventListener(
      "submit",
      function (event) {
        var form = event.target;
        if (!form || !form.querySelectorAll) return;
        flush(form);
      },
      true,
    );
    if (typeof MutationObserver === "undefined") return;
    var mo = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (!node || node.nodeType !== 1) return;
          if (node.matches && (node.matches('input[type="date"]') || node.matches('input[type="datetime-local"]'))) {
            enhanceDateInput(node);
          }
          if (node.querySelectorAll) {
            node.querySelectorAll('input[type="date"], input[type="datetime-local"]').forEach(enhanceDateInput);
          }
        });
      });
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.GymDatePicker = {
    refresh: refresh,
    flush: flush,
    enhance: enhanceDateInput,
    gregorianToJalali: gregorianToJalali,
    jalaliToGregorian: jalaliToGregorian,
    displayJalali: displayJalali,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
