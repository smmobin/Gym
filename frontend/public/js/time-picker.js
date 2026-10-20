(function () {
  "use strict";

  var FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

  function toFaDigits(value) {
    return String(value).replace(/\d/g, function (d) {
      return FA_DIGITS[Number(d)];
    });
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function parseTime(value) {
    var m = String(value || "").trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return { hour: 0, minute: 0 };
    var hour = Math.min(23, Math.max(0, Number(m[1])));
    var minute = Math.min(59, Math.max(0, Number(m[2])));
    return { hour: hour, minute: minute };
  }

  function formatTime(hour, minute) {
    return pad2(hour) + ":" + pad2(minute);
  }

  function displayTime(hour, minute) {
    return toFaDigits(pad2(hour) + ":" + pad2(minute));
  }

  function buildColumn(kind, count, selected) {
    var col = document.createElement("div");
    col.className = "time-picker-col";
    col.setAttribute("data-kind", kind);
    col.setAttribute("role", "listbox");
    col.setAttribute("aria-label", kind === "hour" ? "ساعت" : "دقیقه");

    var fadeTop = document.createElement("span");
    fadeTop.className = "time-picker-fade time-picker-fade-top";
    fadeTop.setAttribute("aria-hidden", "true");
    var fadeBot = document.createElement("span");
    fadeBot.className = "time-picker-fade time-picker-fade-bot";
    fadeBot.setAttribute("aria-hidden", "true");

    var scroller = document.createElement("div");
    scroller.className = "time-picker-scroller";
    scroller.tabIndex = 0;

    for (var i = 0; i < count; i += 1) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "time-picker-opt";
      btn.setAttribute("role", "option");
      btn.dataset.value = String(i);
      btn.textContent = toFaDigits(pad2(i));
      if (i === selected) btn.setAttribute("aria-selected", "true");
      else btn.setAttribute("aria-selected", "false");
      scroller.appendChild(btn);
    }

    col.appendChild(fadeTop);
    col.appendChild(scroller);
    col.appendChild(fadeBot);
    return col;
  }

  function scrollToSelected(scroller, selected) {
    var opt = scroller.querySelector('[data-value="' + selected + '"]');
    if (!opt) return;
    var top = opt.offsetTop - scroller.clientHeight / 2 + opt.clientHeight / 2;
    scroller.scrollTop = Math.max(0, top);
  }

  function enhanceTimeInput(input) {
    if (!input || input.dataset.timeEnhanced === "1") return;
    if (input.closest("[data-time-picker]")) return;
    if (input.readOnly || input.disabled) return;
    if (input.type !== "time") return;

    var parsed = parseTime(input.value);
    var state = { hour: parsed.hour, minute: parsed.minute };

    var root = document.createElement("div");
    root.className = "time-picker";
    root.setAttribute("data-time-picker", "");

    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "time-picker-trigger";
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");

    var clock = document.createElement("span");
    clock.className = "time-picker-clock";
    clock.setAttribute("aria-hidden", "true");
    clock.innerHTML =
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.25"/><path d="M12 8v4.25l2.75 1.75"/></svg>';

    var valueEl = document.createElement("span");
    valueEl.className = "time-picker-value";
    valueEl.textContent = displayTime(state.hour, state.minute);

    var chevron = document.createElement("span");
    chevron.className = "time-picker-chevron";
    chevron.setAttribute("aria-hidden", "true");

    trigger.appendChild(clock);
    trigger.appendChild(valueEl);
    trigger.appendChild(chevron);

    var pop = document.createElement("div");
    pop.className = "time-picker-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "انتخاب ساعت");
    pop.hidden = true;

    var hero = document.createElement("div");
    hero.className = "time-picker-hero";
    var heroLabel = document.createElement("span");
    heroLabel.className = "time-picker-hero-label";
    heroLabel.textContent = "ساعت انتخاب‌شده";
    var heroTime = document.createElement("div");
    heroTime.className = "time-picker-hero-time";
    heroTime.textContent = displayTime(state.hour, state.minute);
    hero.appendChild(heroLabel);
    hero.appendChild(heroTime);

    var columns = document.createElement("div");
    columns.className = "time-picker-columns";

    var hourWrap = document.createElement("div");
    hourWrap.className = "time-picker-col-wrap";
    var hourTitle = document.createElement("span");
    hourTitle.className = "time-picker-col-title";
    hourTitle.textContent = "ساعت";
    var hourCol = buildColumn("hour", 24, state.hour);
    hourWrap.appendChild(hourTitle);
    hourWrap.appendChild(hourCol);

    var minuteWrap = document.createElement("div");
    minuteWrap.className = "time-picker-col-wrap";
    var minuteTitle = document.createElement("span");
    minuteTitle.className = "time-picker-col-title";
    minuteTitle.textContent = "دقیقه";
    var minuteCol = buildColumn("minute", 60, state.minute);
    minuteWrap.appendChild(minuteTitle);
    minuteWrap.appendChild(minuteCol);

    columns.appendChild(hourWrap);
    columns.appendChild(minuteWrap);

    var actions = document.createElement("div");
    actions.className = "time-picker-actions";
    var cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn ghost small";
    cancelBtn.textContent = "انصراف";
    var okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.className = "btn small";
    okBtn.textContent = "تأیید";
    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);

    pop.appendChild(hero);
    pop.appendChild(columns);
    pop.appendChild(actions);

    input.classList.add("time-picker-native");
    input.tabIndex = -1;
    input.setAttribute("aria-hidden", "true");
    input.dataset.timeEnhanced = "1";

    input.parentNode.insertBefore(root, input);
    root.appendChild(input);
    root.appendChild(trigger);
    root.appendChild(pop);

    function syncDisplay() {
      valueEl.textContent = displayTime(state.hour, state.minute);
      heroTime.textContent = displayTime(state.hour, state.minute);
      hourCol.querySelectorAll(".time-picker-opt").forEach(function (opt) {
        opt.setAttribute(
          "aria-selected",
          Number(opt.dataset.value) === state.hour ? "true" : "false",
        );
      });
      minuteCol.querySelectorAll(".time-picker-opt").forEach(function (opt) {
        opt.setAttribute(
          "aria-selected",
          Number(opt.dataset.value) === state.minute ? "true" : "false",
        );
      });
    }

    function applyToInput() {
      var next = formatTime(state.hour, state.minute);
      if (input.value !== next) {
        input.value = next;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      syncDisplay();
    }

    function close() {
      root.classList.remove("is-open");
      trigger.setAttribute("aria-expanded", "false");
      pop.hidden = true;
    }

    function open() {
      document.querySelectorAll("[data-time-picker].is-open").forEach(function (other) {
        if (other === root) return;
        other.classList.remove("is-open");
        var otherPop = other.querySelector(".time-picker-pop");
        var otherTrigger = other.querySelector(".time-picker-trigger");
        if (otherPop) otherPop.hidden = true;
        if (otherTrigger) otherTrigger.setAttribute("aria-expanded", "false");
      });
      document.querySelectorAll("[data-custom-select].is-open").forEach(function (sel) {
        sel.classList.remove("is-open");
        var menu = sel.querySelector(".custom-select-menu");
        var t = sel.querySelector(".custom-select-trigger");
        if (menu) menu.hidden = true;
        if (t) t.setAttribute("aria-expanded", "false");
      });

      var current = parseTime(input.value);
      state.hour = current.hour;
      state.minute = current.minute;
      syncDisplay();

      root.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      pop.hidden = false;

      requestAnimationFrame(function () {
        scrollToSelected(hourCol.querySelector(".time-picker-scroller"), state.hour);
        scrollToSelected(minuteCol.querySelector(".time-picker-scroller"), state.minute);
      });
    }

    function pick(kind, value) {
      if (kind === "hour") state.hour = value;
      else state.minute = value;
      syncDisplay();
      scrollToSelected(
        (kind === "hour" ? hourCol : minuteCol).querySelector(".time-picker-scroller"),
        value,
      );
    }

    trigger.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (root.classList.contains("is-open")) close();
      else open();
    });

    hourCol.addEventListener("click", function (event) {
      var opt = event.target.closest(".time-picker-opt");
      if (!opt || !hourCol.contains(opt)) return;
      event.preventDefault();
      pick("hour", Number(opt.dataset.value));
    });

    minuteCol.addEventListener("click", function (event) {
      var opt = event.target.closest(".time-picker-opt");
      if (!opt || !minuteCol.contains(opt)) return;
      event.preventDefault();
      pick("minute", Number(opt.dataset.value));
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
      close();
    });

    input.addEventListener("change", function () {
      var current = parseTime(input.value);
      state.hour = current.hour;
      state.minute = current.minute;
      syncDisplay();
    });

    // Keep trigger in sync when forms set input.value programmatically
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
            var current = parseTime(next);
            state.hour = current.hour;
            state.minute = current.minute;
            syncDisplay();
          },
        });
      }
    } catch (err) {
      /* ignore environments that block redefine */
    }
  }

  function refresh(scope) {
    var root = scope && scope.querySelectorAll ? scope : document;
    root.querySelectorAll('input[type="time"]').forEach(enhanceTimeInput);
  }

  function init() {
    refresh(document);
    if (typeof MutationObserver === "undefined") return;
    var mo = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (!node || node.nodeType !== 1) return;
          if (node.matches && node.matches('input[type="time"]')) enhanceTimeInput(node);
          if (node.querySelectorAll) {
            node.querySelectorAll('input[type="time"]').forEach(enhanceTimeInput);
          }
        });
      });
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  window.GymTimePicker = {
    refresh: refresh,
    enhance: enhanceTimeInput,
    parseTime: parseTime,
    formatTime: formatTime,
    displayTime: displayTime,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
