"use strict";

const SODA = (() => {
  async function api(path, options = {}) {
    const opts = {
      method: options.method || "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(options.headers || {}) },
    };
    if (options.body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(options.body);
    }
    let res;
    try {
      res = await fetch(path, opts);
    } catch {
      throw new Error("Нет связи с сервером");
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Ошибка ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function toast(message, type = "ok") {
    let wrap = document.querySelector(".toast-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "toast-wrap";
      document.body.appendChild(wrap);
    }
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity .25s";
      setTimeout(() => el.remove(), 260);
    }, 3200);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function fmtDate(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
  }

  function fmtDateTime(ts) {
    if (!ts) return "—";
    return new Date(ts).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function initials(name) {
    return String(name || "?").slice(0, 2);
  }

  function daysLeft(ts) {
    if (!ts) return null;
    return Math.max(0, Math.ceil((ts - Date.now()) / 864e5));
  }

  function planLabel(plan) {
    return { free: "Free", pro: "Pro", premium: "Premium" }[plan] || plan;
  }

  const PLAN_PRICE = { free: "0 ₽", pro: "149 ₽", premium: "349 ₽" };

  let mePromise = null;
  function me(force = false) {
    if (!mePromise || force) {
      mePromise = api("/api/me")
        .then((d) => d.user)
        .catch((err) => {
          if (err.status === 401) return null;
          throw err;
        });
    }
    return mePromise;
  }

  function icon(name, size = 18) {
    const icons = {
      user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
      shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
      key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
      news: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9h4"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z"/>',
      settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
      users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
      home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
      logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
      check: '<path d="m20 6-11 11-5-5"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
      edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
      copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
      chart: '<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>',
      menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
      close: '<path d="M18 6 6 18M6 6l12 12"/>',
      login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/>',
      arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    };
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || ""}</svg>`;
  }

  async function renderHeader() {
    const host = document.getElementById("site-header");
    if (!host) return;
    const user = await me().catch(() => null);
    const path = location.pathname;
    const links = [
      { href: "/", label: "Главная" },
      { href: "/#pricing", label: "Тарифы" },
      { href: "/#features", label: "Возможности" },
      { href: "/news", label: "Новости" },
    ];
    const active = (href) => (href === "/" ? path === "/" : path === href ? "active" : "");
    host.innerHTML = `
      <header class="topbar">
        <div class="container topbar-inner">
          <a class="brand" href="/">
            <img src="/logo.svg" alt="SodaDlc" width="36" height="36" />
            <span>Soda<em>Dlc</em></span>
          </a>
          <nav class="nav" id="mainNav">
            ${links.map((l) => `<a href="${l.href}" class="${active(l.href)}">${l.label}</a>`).join("")}
            ${user ? `<a href="/cabinet">Кабинет</a>` : ""}
            ${user && user.role === "admin" ? `<a href="/admin">Админ-панель</a>` : ""}
          </nav>
          <div class="nav-actions">
            ${
              user
                ? `<a class="user-chip" href="/cabinet"><span class="avatar">${escapeHtml(initials(user.username))}</span>${escapeHtml(user.username)}</a>
                   <a class="btn ghost sm" href="/cabinet">${icon("user", 15)} Кабинет</a>`
                : `<a class="btn ghost sm" href="/login">Войти</a>
                   <a class="btn sm" href="/register">Регистрация</a>`
            }
            <button class="icon-btn burger" id="burger" aria-label="Меню">${icon("menu", 18)}</button>
          </div>
        </div>
      </header>`;
    const burger = document.getElementById("burger");
    const nav = document.getElementById("mainNav");
    if (burger && nav) burger.addEventListener("click", () => nav.classList.toggle("open"));
  }

  function renderFooter() {
    const host = document.getElementById("site-footer");
    if (!host) return;
    host.innerHTML = `
      <footer class="footer">
        <div class="container">
          <div class="footer-grid">
            <div>
              <a class="brand" href="/">
                <img src="/logo.svg" alt="SodaDlc" width="36" height="36" />
                <span>Soda<em>Dlc</em></span>
              </a>
              <p class="muted small" style="margin-top:14px;max-width:280px">Рабочая платформа визуального клиента: аккаунты, подписки, ключи и админ-панель в одном месте.</p>
            </div>
            <div>
              <h4>Разделы</h4>
              <a href="/">Главная</a>
              <a href="/#pricing">Тарифы</a>
              <a href="/#features">Возможности</a>
              <a href="/news">Новости</a>
            </div>
            <div>
              <h4>Аккаунт</h4>
              <a href="/login">Вход</a>
              <a href="/register">Регистрация</a>
              <a href="/cabinet">Личный кабинет</a>
            </div>
            <div>
              <h4>Документы</h4>
              <a href="/terms">Соглашение</a>
              <a href="/privacy">Конфиденциальность</a>
              <a href="/zapret">Настройка Zapret</a>
            </div>
          </div>
          <div class="footer-bottom">
            <span>© ${new Date().getFullYear()} SodaDlc. Все права защищены.</span>
            <span>Работает на Node.js + SQLite</span>
          </div>
        </div>
      </footer>`;
  }

  async function init() {
    renderFooter();
    try {
      await renderHeader();
    } catch (err) {
      console.error(err);
    }
  }

  function bindLogout(selector = "[data-logout]") {
    document.querySelectorAll(selector).forEach((el) => {
      el.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          await api("/api/logout", { method: "POST" });
          location.href = "/";
        } catch (err) {
          toast(err.message, "err");
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return { api, toast, escapeHtml, fmtDate, fmtDateTime, initials, daysLeft, planLabel, PLAN_PRICE, me, icon, bindLogout, renderHeader };
})();
