"use strict";

(() => {
  const SAVE_KEY = "soda_clicker_v1";
  const KEY_COST = 1e12;
  const $ = (id) => document.getElementById(id);

  const UPGRADES = [
    {
      id: "power", name: "Сила клика", desc: "+1 к силе за уровень", base: 15, growth: 1.55,
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m13 2-2 9h7l-9 11 2-9H4z"/></svg>',
    },
    {
      id: "energy", name: "Макс. энергия", desc: "+20 к запасу, сразу +20", base: 40, growth: 1.6,
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="15" height="10" rx="2"/><path d="M21 10v4"/></svg>',
    },
    {
      id: "regen", name: "Регенерация", desc: "+1 энергии в секунду", base: 80, growth: 1.7,
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
    },
    {
      id: "auto", name: "Автоклик", desc: "+0.5 клика в секунду (зависит от силы)", base: 150, growth: 1.65,
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    },
    {
      id: "crit", name: "Крит", desc: "+4% шанс крита ×10", base: 250, growth: 1.9, cap: 12,
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>',
    },
  ];

  const defaults = {
    balance: 0, total: 0, run: 0, rebirths: 0, energy: 100, playtime: 0,
    upgrades: { power: 0, energy: 0, regen: 0, auto: 0, crit: 0 },
  };

  const num = (value, fallback = 0) => {
    const x = Number(value);
    return Number.isFinite(x) ? x : fallback;
  };

  const state = {
    ...defaults,
    upgrades: { ...defaults.upgrades },
    rev: 0,
    claimed: 0,
    keySpent: 0,
  };

  let ready = false;
  let saving = false;
  let queued = false;
  let claiming = false;
  let migrated = false;
  let last = Date.now();
  let lastSave = Date.now();

  function mult() {
    return 1 + state.rebirths * 0.25;
  }
  function maxEnergy() {
    return 100 + state.upgrades.energy * 20;
  }
  function regen() {
    return 3 + state.upgrades.regen;
  }
  function clickPower() {
    return (1 + state.upgrades.power) * mult();
  }
  function autoCps() {
    return state.upgrades.auto * clickPower() * 0.5;
  }
  function critChance() {
    return Math.min(0.5, state.upgrades.crit * 0.04);
  }
  function rebirthNeed() {
    return Math.floor(5000 * Math.pow(6, state.rebirths));
  }
  function upCost(u) {
    return Math.floor(u.base * Math.pow(u.growth, state.upgrades[u.id]));
  }

  const nf = new Intl.NumberFormat("ru-RU");
  const full = (n) => nf.format(Math.floor(n));
  function fmt(n) {
    n = Math.floor(n);
    if (n >= 1e12) return parseFloat((n / 1e12).toFixed(2)) + " трлн";
    if (n >= 1e9) return parseFloat((n / 1e9).toFixed(2)) + " млрд";
    if (n >= 1e6) return parseFloat((n / 1e6).toFixed(2)) + " млн";
    if (n >= 1e3) return parseFloat((n / 1e3).toFixed(1)) + " тыс";
    return String(n);
  }

  function round2(value) {
    return value.toFixed(2).replace(/\.?0+$/, "");
  }

  function addGain(value) {
    const cap = Number.MAX_SAFE_INTEGER;
    state.balance = Math.min(cap, state.balance + value);
    state.total = Math.min(cap, state.total + value);
    state.run = Math.min(cap, state.run + value);
  }

  function applyServer(data) {
    state.total = num(data.total);
    state.claimed = Math.floor(num(data.claimed));
    state.balance = num(data.balance);
    state.run = num(data.run);
    state.rebirths = Math.floor(num(data.rebirths));
    state.upgrades = { ...defaults.upgrades, ...(data.upgrades || {}) };
    for (const key of Object.keys(defaults.upgrades)) {
      state.upgrades[key] = Math.max(0, Math.floor(num(state.upgrades[key])));
    }
    state.rev = Math.floor(num(data.rev));
    state.energy = Math.min(maxEnergy(), num(data.energy, maxEnergy()));
    state.playtime = Math.max(0, num(data.playtime));
    state.keySpent = state.claimed * KEY_COST;
  }

  function payload() {
    return {
      rev: state.rev,
      total: state.total,
      balance: state.balance,
      run: state.run,
      rebirths: state.rebirths,
      energy: state.energy,
      playtime: state.playtime,
      upgrades: state.upgrades,
    };
  }

  async function persist() {
    if (!ready) return;
    if (saving) {
      queued = true;
      return;
    }
    saving = true;
    try {
      const data = await SODA.api("/api/clicker/save", { method: "POST", body: payload() });
      applyServer(data);
      render();
    } catch (err) {
      if (err.status === 409 && err.data && err.data.state) {
        applyServer(err.data.state);
        render();
      } else if (err.status === 401) {
        location.href = "/login?next=/clicker";
      }
    } finally {
      saving = false;
      if (queued) {
        queued = false;
        setTimeout(persist, 500);
      }
    }
  }

  const stage = $("ckStage");
  const sticker = $("ckSticker");
  const floats = $("ckFloats");
  const upgradesEl = $("ckUpgrades");

  function spawnFloat(event, value, crit) {
    const rect = stage.getBoundingClientRect();
    const hasPointer = event && event.detail !== 0 && event.clientX && event.clientY;
    const x = hasPointer ? event.clientX - rect.left : rect.width / 2;
    const y = hasPointer ? event.clientY - rect.top : rect.height * 0.38;
    const el = document.createElement("span");
    el.className = "ck-float" + (crit ? " crit" : "");
    el.textContent = (crit ? "КРИТ +" : "+") + fmt(value);
    el.style.left = x + "px";
    el.style.top = y + "px";
    floats.appendChild(el);
    setTimeout(() => el.remove(), 850);
  }

  function renderUpgrades() {
    upgradesEl.innerHTML = UPGRADES.map((u) => {
      const lvl = state.upgrades[u.id];
      const capped = u.cap && lvl >= u.cap;
      return `<article class="ck-up">
        <div class="ck-up-icon">${u.icon}</div>
        <div class="ck-up-body">
          <div class="ck-up-top"><h3>${u.name}</h3><span class="ck-up-lvl">ур. ${lvl}</span></div>
          <p>${u.desc}</p>
          <button class="btn ghost sm" type="button" data-buy="${u.id}">
            ${capped ? "Максимум" : "Улучшить · " + fmt(upCost(u))}
          </button>
        </div>
      </article>`;
    }).join("");
  }

  function syncUpgradeButtons() {
    upgradesEl.querySelectorAll("[data-buy]").forEach((btn) => {
      const u = UPGRADES.find((x) => x.id === btn.dataset.buy);
      if (!u) return;
      const capped = u.cap && state.upgrades[u.id] >= u.cap;
      btn.disabled = Boolean(capped) || state.balance < upCost(u);
    });
  }

  function render() {
    const me = maxEnergy();
    if (state.energy > me) state.energy = me;
    $("ckBalance").textContent = fmt(state.balance);
    $("ckTotal").textContent = fmt(state.total);
    $("ckCps").textContent = fmt(autoCps());
    $("ckMult").textContent = "×" + round2(mult());
    $("ckPower").textContent = fmt(clickPower());

    const energy = Math.floor(state.energy);
    $("ckEnergyText").textContent = energy + " / " + me;
    $("ckEnergyFill").style.width = Math.max(0, Math.min(100, (state.energy / me) * 100)) + "%";
    $("ckEnergyFill").classList.toggle("low", state.energy < me * 0.2);
    $("ckRegenText").textContent = "+" + regen() + " в секунду";

    const rem = Math.max(0, state.total - state.keySpent);
    const pct = Math.min(100, (rem / KEY_COST) * 100);
    $("ckKeyFill").style.width = pct + "%";
    $("ckKeyProgress").textContent = pct >= 100 ? "100%" : pct.toFixed(1) + "%";
    $("ckKeyText").textContent = fmt(rem) + " / 1 трлн";
    const keyBtn = $("ckKeyBtn");
    keyBtn.disabled = claiming || rem < KEY_COST;
    keyBtn.textContent = claiming ? "Получаем ключ…" : "Обменять на ключ";
    keyBtn.title = rem < KEY_COST ? "Нужно накопить 1 000 000 000 000 кликов" : "";

    const need = rebirthNeed();
    const canRebirth = state.run >= need;
    $("ckRebirths").textContent = state.rebirths;
    $("ckRebirthMult").textContent = "×" + round2(mult());
    $("ckRebirthText").textContent =
      "Сбросит баланс, энергию и прокачку, но даст +25% к силе навсегда. " +
      (canRebirth
        ? "Условие выполнено — можно перерождаться."
        : "За этот забег нужно " + fmt(need) + " кликов, сейчас " + fmt(state.run) + ".");
    const rbBtn = $("ckRebirthBtn");
    rbBtn.disabled = !canRebirth;
    rbBtn.textContent = canRebirth ? "Переродиться" : "Нужно " + fmt(need);

    syncUpgradeButtons();
  }

  function tick() {
    const t = Date.now();
    const dt = Math.min((t - last) / 1000, 30);
    last = t;
    if (!ready) return;
    if (document.visibilityState === "visible") state.playtime += dt;
    state.energy = Math.min(maxEnergy(), state.energy + regen() * dt);
    const gained = autoCps() * dt;
    if (gained > 0) addGain(gained);
    render();
    if (t - lastSave > 3000) {
      lastSave = t;
      persist();
    }
  }

  function clickSticker(event) {
    if (!ready) return;
    if (state.energy < 1) {
      stage.classList.remove("noenergy");
      void stage.offsetWidth;
      stage.classList.add("noenergy");
      setTimeout(() => stage.classList.remove("noenergy"), 260);
      return;
    }
    state.energy -= 1;
    const crit = Math.random() < critChance();
    const gain = clickPower() * (crit ? 10 : 1);
    addGain(gain);
    sticker.classList.remove("hit");
    void sticker.offsetWidth;
    sticker.classList.add("hit");
    setTimeout(() => sticker.classList.remove("hit"), 130);
    spawnFloat(event, gain, crit);
    render();
  }

  sticker.addEventListener("click", clickSticker);

  upgradesEl.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-buy]");
    if (!btn || !ready) return;
    const u = UPGRADES.find((x) => x.id === btn.dataset.buy);
    if (!u) return;
    if (u.cap && state.upgrades[u.id] >= u.cap) return;
    const cost = upCost(u);
    if (state.balance < cost) {
      SODA.toast("Не хватает кликов", "err");
      return;
    }
    state.balance -= cost;
    state.upgrades[u.id] += 1;
    if (u.id === "energy") state.energy = Math.min(maxEnergy(), state.energy + 20);
    renderUpgrades();
    render();
    persist();
  });

  $("ckRebirthBtn").addEventListener("click", () => {
    if (!ready) return;
    const need = rebirthNeed();
    if (state.run < need) return;
    state.rebirths += 1;
    state.balance = 0;
    state.run = 0;
    state.upgrades = { power: 0, energy: 0, regen: 0, auto: 0, crit: 0 };
    state.energy = maxEnergy();
    renderUpgrades();
    render();
    persist();
    SODA.toast("Перерождение! Множитель ×" + round2(mult()));
  });

  $("ckKeyBtn").addEventListener("click", async () => {
    if (!ready || claiming || state.total - state.keySpent < KEY_COST) return;
    claiming = true;
    render();
    try {
      const data = await SODA.api("/api/clicker/redeem", {
        method: "POST",
        body: { total: state.total },
      });
      applyServer(data.state);
      $("ckKeyValue").textContent = data.key;
      $("ckKeyResult").classList.remove("hidden");
      render();
      SODA.toast("Ключ на 7 дней получен");
    } catch (err) {
      SODA.toast(err.message, "err");
    } finally {
      claiming = false;
      render();
    }
  });

  $("ckBoardsRefresh").addEventListener("click", loadBoards);

  $("ckCopyKey").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText($("ckKeyValue").textContent);
      SODA.toast("Ключ скопирован");
    } catch {
      SODA.toast("Не удалось скопировать", "err");
    }
  });

  window.addEventListener("pagehide", () => {
    if (!ready) return;
    try {
      const blob = new Blob([JSON.stringify(payload())], { type: "application/json" });
      navigator.sendBeacon("/api/clicker/save", blob);
    } catch {}
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) persist();
    else last = Date.now();
  });

  let currentUser = "";

  function fmtHours(seconds) {
    if (seconds <= 0) return "0 мин";
    const h = seconds / 3600;
    if (h < 1) return Math.max(1, Math.round(seconds / 60)) + " мин";
    return (h < 10 ? h.toFixed(1) : Math.floor(h)) + " ч";
  }

  function renderBoard(id, rows, format) {
    const el = $(id);
    if (!el) return;
    if (!rows || !rows.length) {
      el.innerHTML = '<li class="ck-board-empty">Пока пусто</li>';
      return;
    }
    el.innerHTML = rows
      .map((row, i) => {
        const me = currentUser && row.username.toLowerCase() === currentUser.toLowerCase();
        return `<li class="ck-board-row${me ? " me" : ""}">
          <span class="ck-rank">${i + 1}</span>
          <span class="ck-board-name">${SODA.escapeHtml(row.username)}</span>
          <b>${format(row.value)}</b>
        </li>`;
      })
      .join("");
  }

  async function loadBoards() {
    try {
      const data = await SODA.api("/api/clicker/leaderboard");
      renderBoard("ckBoardRebirths", data.rebirths, (v) => fmt(v));
      renderBoard("ckBoardClicks", data.clicks, (v) => fmt(v));
      renderBoard("ckBoardHours", data.hours, (v) => fmtHours(v));
    } catch {}
  }

  async function boot() {
    let cached = null;
    try {
      cached = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    } catch {}

    try {
      const data = await SODA.api("/api/clicker/state");
      applyServer(data);
    } catch (err) {
      if (err.status === 401) {
        location.replace("/login?next=/clicker");
        return;
      }
      SODA.toast("Не удалось загрузить прогресс. Обнови страницу.", "err");
      return;
    }

    if (cached && num(cached.total) > state.total && state.rev === 0) {
      state.balance = Math.max(state.balance, num(cached.balance));
      state.total = Math.max(state.total, num(cached.total));
      state.run = Math.max(state.run, num(cached.run));
      state.rebirths = Math.max(state.rebirths, Math.floor(num(cached.rebirths)));
      state.energy = Math.min(maxEnergy(), Math.max(state.energy, num(cached.energy)));
      state.playtime = Math.max(state.playtime, num(cached.playtime));
      for (const key of Object.keys(defaults.upgrades)) {
        state.upgrades[key] = Math.max(state.upgrades[key], Math.floor(num(cached.upgrades && cached.upgrades[key])));
      }
      migrated = true;
    }
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {}

    ready = true;
    last = Date.now();
    lastSave = Date.now();
    renderUpgrades();
    render();
    if (migrated) persist();
    setInterval(tick, 200);
    SODA.me()
      .then((u) => {
        currentUser = (u && u.username) || "";
      })
      .catch(() => {})
      .finally(loadBoards);
    setInterval(loadBoards, 30000);
  }

  boot();
})();
