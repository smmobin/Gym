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
    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn ghost small";
    cancelBtn.textContent = "انصراف";
    var okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.className = "btn small";
    okBtn.textContent = "تأیید";
    actions.appendChild(todayBtn);
    var spacer = document.createElement("span");
    spacer.className = "date-picker-actions-spacer";
    actions.appendChild(spacer);
    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);

    pop.appendChild(hero);
    pop.appendChild(nav);
    pop.appendChild(week);
    pop.appendChild(grid);
    if (timeBlock) pop.appendChild(timeBlock);
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

    function syncDisplay() {
      if (withTime) {
        valueEl.textContent = displayJalaliDateTime(state.y, state.m, state.d, state.hour, state.minute);
        heroValue.textContent = displayJalaliDateTime(state.y, state.m, state.d, state.hour, state.minute);
      } else {
        valueEl.textContent = displayJalali(state.y, state.m, state.d);
        heroValue.textContent = displayJalali(state.y, state.m, state.d);
      }
      title.textContent = toFaDigits(MONTHS[state.viewJm - 1] + " " + state.viewJy);
      if (hourValueEl) hourValueEl.textContent = toFaDigits(pad2(state.hour));
      if (minuteValueEl) minuteValueEl.textContent = toFaDigits(pad2(state.minute));
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

    function applyToInput() {
      var next = withTime
        ? formatDateTimeLocal(state.y, state.m, state.d, state.hour, state.minute)
        : formatIsoDate(state.y, state.m, state.d);
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
      pullFromInput();
      root.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      pop.hidden = false;
    }

    function pickDay(day) {
      var g = jalaliToGregorian(state.viewJy, state.viewJm, day);
      state.y = g[0];
      state.m = g[1];
      state.d = g[2];
      syncDisplay();
      renderGrid();
      // Date-only: commit immediately so FormData / گزارش بازه the real value (not just the label).
      if (!withTime) {
        applyToInput();
        close();
      }
    }

    trigger.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (root.classList.contains("is-open")) {
        if (!withTime) applyToInput();
        close();
      } else open();
    });

    prevBtn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
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
      state.viewJm += 1;
      if (state.viewJm > 12) {
        state.viewJm = 1;
        state.viewJy += 1;
      }
      syncDisplay();
      renderGrid();
    });

    grid.addEventListener("click", function (event) {
      var dayBtn = event.target.closest(".date-picker-day:not(.is-blank)");
      if (!dayBtn || !grid.contains(dayBtn)) return;
      event.preventDefault();
      pickDay(Number(dayBtn.dataset.day));
    });

    if (timeBlock) {
      timeBlock.addEventListener("click", function (event) {
        var btn = event.target.closest(".date-picker-step-btn");
        if (!btn || !timeBlock.contains(btn)) return;
        event.preventDefault();
        event.stopPropagation();
        var kind = btn.dataset.kind;
        var delta = Number(btn.dataset.delta);
        if (kind === "hour") state.hour = (state.hour + delta + 24) % 24;
        else state.minute = (state.minute + delta + 60) % 60;
        syncDisplay();
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
      if (!withTime) {
        applyToInput();
        close();
      }
    });

    okBtn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      applyToInput();
      close();
      trigger.focus();
    });

    cancelBtn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      pullFromInput();
      syncDisplay();
      renderGrid();
      close();
      trigger.focus();
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
        close();
        trigger.focus();
      }
    });

    document.addEventListener("click", function (event) {
      if (!root.classList.contains("is-open")) return;
      if (root.contains(event.target)) return;
      // Keep trigger label and hidden input in sync (outside-click used to leave them mismatched).
      if (!withTime) applyToInput();
      else {
        pullFromInput();
        syncDisplay();
        renderGrid();
      }
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
