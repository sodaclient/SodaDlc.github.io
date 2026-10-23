"use strict";

(() => {
  const SAVE_KEY = "soda_clicker_v1";
  const KEY_COST = 1e12;
  const OFFLINE_CAP = 12 * 3600;
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
      id: "auto", name: "Автоклик", desc: "+0.5 клика/сек, фармит и офлайн (до 12 ч)", base: 150, growth: 1.65,
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    },
    {
      id: "crit", name: "Крит", desc: "+4% шанс крита ×10", base: 250, growth: 1.9, cap: 12,
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>',
    },
  ];

  const SKILLS = [
    {
      id: "might", branch: "power", name: "Титаническая сила", desc: "+8% к силе клика за уровень", max: 12,
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m13 2-2 9h7l-9 11 2-9H4z"/></svg>',
    },
    {
      id: "crit", branch: "power", name: "Острые когти", desc: "+1% к шансу крита за уровень", max: 15,
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>',
    },
    {
      id: "rage", branch: "power", name: "Ярость", desc: "+0.5× к урону крита за уровень", max: 15, req: { id: "might", level: 5 },
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2c1.5 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 2 2 2.5 2 4a2.5 2.5 0 0 0 3-2.5C14 6 12 4 12 2z"/></svg>',
    },
    {
      id: "battery", branch: "energy", name: "Ёмкая батарея", desc: "+20 к максимуму энергии за уровень", max: 12,
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="15" height="10" rx="2"/><path d="M21 10v4M8 10v4M12 10v4"/></svg>',
    },
    {
      id: "flow", branch: "energy", name: "Быстрый поток", desc: "+1 энергии в секунду за уровень", max: 15,
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c3 4 6 7 6 10a6 6 0 0 1-12 0c0-3 3-6 6-10z"/></svg>',
    },
    {
      id: "offline", branch: "energy", name: "Ночная смена", desc: "+1 ч к офлайн-фарму за уровень", max: 12, req: { id: "battery", level: 5 },
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/><path d="M17 4v3M15.5 5.5h3"/></svg>',
    },
    {
      id: "auto", branch: "auto", name: "Автопилот", desc: "+12% к скорости автоклика за уровень", max: 15,
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2M4 4l3 3M20 4l-3 3"/></svg>',
    },
    {
      id: "fortune", branch: "auto", name: "Золотая жила", desc: "+5% ко всем кликам за уровень", max: 12, req: { id: "auto", level: 5 },
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.5h5M9.5 14.5h5"/></svg>',
    },
    {
      id: "rebirth", branch: "auto", name: "Колесо сансары", desc: "−3% к требованию перерождения за уровень", max: 15, req: { id: "fortune", level: 5 },
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 16v4h4M21 8V4h-4"/></svg>',
    },
  ];
  const SKILL_BRANCHES = [
    { id: "power", name: "Сила", tag: "Ветка I", desc: "Больше урона с каждого клика.", skills: ["might", "crit", "rage"] },
    { id: "energy", name: "Энергия", tag: "Ветка II", desc: "Дольше кликай без остановки.", skills: ["battery", "flow", "offline"] },
    { id: "auto", name: "Автоматизация", tag: "Ветка III", desc: "Пусть клики идут сами.", skills: ["auto", "fortune", "rebirth"] },
  ];
  const SKILL_DEFAULTS = Object.fromEntries(SKILLS.map((skill) => [skill.id, 0]));

  const defaults = {
    balance: 0, total: 0, run: 0, rebirths: 0, energy: 100, playtime: 0,
    upgrades: { power: 0, energy: 0, regen: 0, auto: 0, crit: 0 },
    skills: SKILL_DEFAULTS,
  };

  const num = (value, fallback = 0) => {
    const x = Number(value);
    return Number.isFinite(x) ? x : fallback;
  };

  const state = {
    ...defaults,
    upgrades: { ...defaults.upgrades },
    skills: { ...SKILL_DEFAULTS },
    rev: 0,
    claimed: 0,
    keySpent: 0,
    updatedAt: 0,
  };

  let ready = false;
  let saving = false;
  let queued = false;
  let claiming = false;
  let migrated = false;
  let localVersion = 0;
  let last = Date.now();
  let lastSave = Date.now();

  function skillLevel(id) {
    return state.skills[id] || 0;
  }
  function skillPointsEarned() {
    return state.rebirths + Math.floor(state.rebirths / 5) + Math.floor(state.rebirths / 10);
  }
  function skillPointsSpent() {
    return SKILLS.reduce((sum, skill) => sum + skillLevel(skill.id), 0);
  }
  function availableSkillPoints() {
    return Math.max(0, skillPointsEarned() - skillPointsSpent());
  }
  function skillRequirementMet(skill) {
    return !skill.req || skillLevel(skill.req.id) >= skill.req.level;
  }
  function skillEffect(skill, level) {
    switch (skill.id) {
      case "might": return "+" + level * 8 + "% к силе клика";
      case "crit": return "+" + level + "% к шансу крита";
      case "rage": return "×" + round2(10 + level * 0.5) + " урон крита";
      case "battery": return "+" + level * 20 + " к максимуму энергии";
      case "flow": return "+" + level + " энергии/сек";
      case "offline": return "+" + level + " ч к офлайн-фарму";
      case "auto": return "+" + level * 12 + "% к автоклику";
      case "fortune": return "+" + level * 5 + "% ко всем кликам";
      case "rebirth": return "−" + level * 3 + "% к требованию перерождения";
      default: return "";
    }
  }
  function offlineCap() {
    return OFFLINE_CAP + skillLevel("offline") * 3600;
  }
  function fortuneMult() {
    return 1 + skillLevel("fortune") * 0.05;
  }

  function mult() {
    return 1 + state.rebirths * 0.25;
  }
  function maxEnergy() {
    return 100 + state.upgrades.energy * 20 + skillLevel("battery") * 20;
  }
  function regen() {
    return 3 + state.upgrades.regen + skillLevel("flow");
  }
  function clickPower() {
    return (1 + state.upgrades.power) * mult() * (1 + skillLevel("might") * 0.08);
  }
  function autoCps() {
    return state.upgrades.auto * clickPower() * 0.5 * (1 + skillLevel("auto") * 0.12);
  }
  function critChance() {
    return Math.min(0.75, state.upgrades.crit * 0.04 + skillLevel("crit") * 0.01);
  }
  function critMultiplier() {
    return 10 + skillLevel("rage") * 0.5;
  }
  function rebirthNeed() {
    const base = 5000 * Math.pow(6, state.rebirths);
    return Math.max(1, Math.floor(base * Math.max(0.25, 1 - skillLevel("rebirth") * 0.03)));
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
    value *= fortuneMult();
    state.balance = Math.min(cap, state.balance + value);
    state.total = Math.min(cap, state.total + value);
    state.run = Math.min(cap, state.run + value);
    localVersion += 1;
    return value;
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
    state.skills = { ...SKILL_DEFAULTS, ...(data.skills || {}) };
    for (const skill of SKILLS) {
      state.skills[skill.id] = Math.min(skill.max, Math.max(0, Math.floor(num(state.skills[skill.id]))));
    }
    state.rev = Math.floor(num(data.rev));
    state.energy = Math.min(maxEnergy(), num(data.energy, maxEnergy()));
    state.playtime = Math.max(0, num(data.playtime));
    state.updatedAt = num(data.updatedAt);
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
      skills: state.skills,
    };
  }

  function mergeServer(data) {
    const serverRev = Math.floor(num(data.rev));
    state.total = Math.max(state.total, num(data.total));
    state.playtime = Math.max(state.playtime, num(data.playtime));
    if (serverRev >= state.rev) {
      state.rev = serverRev;
      state.claimed = Math.floor(num(data.claimed));
      state.updatedAt = Math.max(state.updatedAt, num(data.updatedAt));
    }
    state.keySpent = state.claimed * KEY_COST;
  }

  async function persist() {
    if (!ready) return;
    if (saving) {
      queued = true;
      return;
    }
    saving = true;
    const sentVersion = localVersion;
    try {
      const data = await SODA.api("/api/clicker/save", { method: "POST", body: payload() });
      if (localVersion === sentVersion) {
        applyServer(data);
        renderSkills();
      } else {
        mergeServer(data);
      }
      render();
    } catch (err) {
      if (err.status === 409 && err.data && err.data.state) {
        if (localVersion === sentVersion) {
          applyServer(err.data.state);
          renderSkills();
        } else {
          mergeServer(err.data.state);
          queued = true;
        }
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
  const skillsEl = $("ckSkills");

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

  function renderSkills() {
    if (!skillsEl) return;
    const points = availableSkillPoints();
    skillsEl.innerHTML = SKILL_BRANCHES.map((branch) => {
      const nodes = branch.skills.map((id) => {
        const skill = SKILLS.find((item) => item.id === id);
        const level = skillLevel(skill.id);
        const maxed = level >= skill.max;
        const locked = !skillRequirementMet(skill);
        const canBuy = !maxed && !locked && points > 0;
        const current = level > 0 ? skillEffect(skill, level) : "Нет бонуса";
        const next = maxed ? "" : skillEffect(skill, level + 1);
        const reqSkill = skill.req ? SKILLS.find((item) => item.id === skill.req.id) : null;
        const buttonText = maxed
          ? "Максимум"
          : locked
            ? "Заблокировано"
            : points < 1
              ? "Нужно очко"
              : "Изучить · 1 очко";
        return `<article class="ck-skill${locked ? " is-locked" : ""}${maxed ? " is-maxed" : ""}">
          <div class="ck-skill-head">
            <span class="ck-skill-icon">${skill.icon}</span>
            <span class="ck-skill-lvl">${level} / ${skill.max}</span>
          </div>
          <h3>${skill.name}</h3>
          <p>${skill.desc}</p>
          <div class="ck-skill-effect">Сейчас: ${current}</div>
          ${!maxed && !locked ? `<div class="ck-skill-next">Далее: ${next}</div>` : ""}
          ${locked ? `<div class="ck-skill-req">Нужно: ${reqSkill.name} ур. ${skill.req.level}</div>` : ""}
          <button class="btn ghost sm" type="button" data-skill="${skill.id}" ${canBuy ? "" : "disabled"}>${buttonText}</button>
        </article>`;
      }).join("");
      return `<div class="ck-skill-branch ${branch.id}">
        <div class="ck-skill-branch-head">
          <span class="ck-skill-tag">${branch.tag}</span>
          <h3>${branch.name}</h3>
          <p>${branch.desc}</p>
        </div>
        <div class="ck-skill-list">${nodes}</div>
      </div>`;
    }).join("");
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
      "Сбросит баланс, энергию и прокачку, но даст +25% к силе и очки навыков навсегда. " +
      (canRebirth
        ? "Условие выполнено — можно перерождаться."
        : "За этот забег нужно " + fmt(need) + " кликов, сейчас " + fmt(state.run) + ".");
    const rbBtn = $("ckRebirthBtn");
    rbBtn.disabled = !canRebirth;
    rbBtn.textContent = canRebirth ? "Переродиться" : "Нужно " + fmt(need);

    $("ckSkillPoints").textContent = full(availableSkillPoints());
    $("ckSkillTotal").textContent = "из " + full(skillPointsEarned());
    syncUpgradeButtons();
  }

  function tick() {
    const t = Date.now();
    const raw = Math.max(0, (t - last) / 1000);
    const dt = Math.min(raw, offlineCap());
    last = t;
    if (!ready) return;
    let changed = false;
    if (document.visibilityState === "visible" && raw > 0) {
      state.playtime += Math.min(raw, 30);
      changed = true;
    }
    const nextEnergy = Math.min(maxEnergy(), state.energy + regen() * dt);
    if (nextEnergy !== state.energy) {
      state.energy = nextEnergy;
      changed = true;
    }
    const gained = autoCps() * dt;
    if (gained > 0) addGain(gained);
    if (changed) localVersion += 1;
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
    const gain = addGain(clickPower() * (crit ? critMultiplier() : 1));
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
    localVersion += 1;
    renderUpgrades();
    render();
    persist();
  });

  if (skillsEl) skillsEl.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-skill]");
    if (!btn || !ready) return;
    const skill = SKILLS.find((item) => item.id === btn.dataset.skill);
    if (!skill) return;
    const level = skillLevel(skill.id);
    if (level >= skill.max) return;
    if (!skillRequirementMet(skill)) {
      SODA.toast("Сначала изучи предыдущий навык", "err");
      return;
    }
    if (availableSkillPoints() < 1) {
      SODA.toast("Нет очков навыков — переродись", "err");
      return;
    }
    state.skills[skill.id] = level + 1;
    if (skill.id === "battery") state.energy = Math.min(maxEnergy(), state.energy + 20);
    localVersion += 1;
    renderSkills();
    render();
    persist();
    SODA.toast(skill.name + " · ур. " + (level + 1));
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
    localVersion += 1;
    renderUpgrades();
    renderSkills();
    render();
    persist();
    SODA.toast("Перерождение! Множитель ×" + round2(mult()) + " · очков навыков: " + availableSkillPoints());
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
      localVersion += 1;
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
        const face = row.avatar
          ? `<img src="${SODA.escapeHtml(row.avatar)}" alt="" />`
          : SODA.escapeHtml(SODA.initials(row.username));
        return `<li class="ck-board-row${me ? " me" : ""}">
          <span class="ck-rank">${i + 1}</span>
          <span class="ck-board-avatar">${face}</span>
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
      if (cached.skills) {
        for (const skill of SKILLS) {
          state.skills[skill.id] = Math.min(skill.max, Math.max(state.skills[skill.id], Math.floor(num(cached.skills[skill.id]))));
        }
      }
      migrated = true;
    }
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {}

    let offlineGain = 0;
    const idle = Math.min(Math.max((Date.now() - state.updatedAt) / 1000, 0), offlineCap());
    if (idle >= 30 && autoCps() > 0) {
      offlineGain = addGain(autoCps() * idle);
      state.energy = Math.min(maxEnergy(), state.energy + regen() * idle);
    }

    ready = true;
    last = Date.now();
    lastSave = Date.now();
    renderUpgrades();
    renderSkills();
    render();
    if (offlineGain > 0) SODA.toast("Офлайн-фарм: +" + fmt(offlineGain) + " кликов");
    if (migrated || offlineGain > 0) persist();
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
