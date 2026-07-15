/* ═══════════════════════════════════════════════════════════════════════
   Alexandria — Library AI Assistant  |  Frontend Application
   ══════════════════════════════════════════════════════════════════════ */

"use strict";

/* ──────────────────────────────────────────────────────────────────────
   STATE
   ────────────────────────────────────────────────────────────────────── */
const State = {
  chatHistory: [],        // [{role, content}]
  favorites:   [],        // book id strings
  readHistory: [],        // [{id, title, author, genre, level, date}]
  darkMode:    false,
  currentBook: null,      // for modal
  allBooks:    [],        // loaded from /api/featured-books
};

/* ──────────────────────────────────────────────────────────────────────
   QUICK CHIPS — suggestions shown under the chat input
   ────────────────────────────────────────────────────────────────────── */
const QUICK_CHIPS = [
  "Recommend Python books for beginners",
  "Best books for coding interviews",
  "Create a 4-week ML reading plan",
  "Top system design books",
  "Suggest books for data structures & algorithms",
  "Best books for learning JavaScript",
  "Recommend books on AI and machine learning",
  "Books for competitive programming",
];

/* ──────────────────────────────────────────────────────────────────────
   UTILITY
   ────────────────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

function formatTime(iso) {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Very lightweight markdown→HTML converter for chat bubbles.
 * Handles: **bold**, *italic*, `code`, # headings, - lists, numbered lists, --- hr
 */
function mdToHtml(text) {
  let html = escapeHtml(text);
  // Code blocks
  html = html.replace(/```[\s\S]*?```/g, m => {
    const inner = m.slice(3, -3).trim();
    return `<pre><code>${inner}</code></pre>`;
  });
  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Headings
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  // HR
  html = html.replace(/^---$/gm, "<hr>");
  // Numbered lists (wrap runs of items)
  html = html.replace(/((?:^\d+\. .+\n?)+)/gm, m => {
    const items = m.trim().split("\n").map(l => `<li>${l.replace(/^\d+\. /, "")}</li>`).join("");
    return `<ol>${items}</ol>`;
  });
  // Unordered lists
  html = html.replace(/((?:^[-*] .+\n?)+)/gm, m => {
    const items = m.trim().split("\n").map(l => `<li>${l.replace(/^[-*] /, "")}</li>`).join("");
    return `<ul>${items}</ul>`;
  });
  // Line breaks
  html = html.replace(/\n/g, "<br>");
  return html;
}

function showToast(message, variant = "success") {
  const toast  = $("appToast");
  const body   = $("toastBody");
  body.innerHTML = message;
  toast.className = `toast align-items-center border-0 text-bg-${variant}`;
  bootstrap.Toast.getOrCreateInstance(toast, { delay: 3000 }).show();
}

function saveToStorage() {
  localStorage.setItem("alex_favorites",   JSON.stringify(State.favorites));
  localStorage.setItem("alex_readHistory", JSON.stringify(State.readHistory));
  localStorage.setItem("alex_darkMode",    JSON.stringify(State.darkMode));
}

function loadFromStorage() {
  try {
    State.favorites   = JSON.parse(localStorage.getItem("alex_favorites")   || "[]");
    State.readHistory = JSON.parse(localStorage.getItem("alex_readHistory") || "[]");
    State.darkMode    = JSON.parse(localStorage.getItem("alex_darkMode")    || "false");
  } catch (_) { /* ignore corrupted storage */ }
}

/* ──────────────────────────────────────────────────────────────────────
   DARK MODE
   ────────────────────────────────────────────────────────────────────── */
function applyTheme() {
  document.documentElement.setAttribute("data-theme", State.darkMode ? "dark" : "light");
  $("themeIcon").className = State.darkMode ? "bi bi-sun-fill" : "bi bi-moon-stars-fill";
}

function toggleTheme() {
  State.darkMode = !State.darkMode;
  applyTheme();
  saveToStorage();
}

/* ──────────────────────────────────────────────────────────────────────
   SECTION NAVIGATION
   ────────────────────────────────────────────────────────────────────── */
function showSection(name) {
  document.querySelectorAll(".app-section").forEach(s => s.classList.add("d-none"));
  const target = $(`section-${name}`);
  if (target) {
    target.classList.remove("d-none");
    // Lazy-render section-specific content
    if (name === "dashboard")  renderBookGrid("All");
    if (name === "history")    renderHistory();
    if (name === "favorites")  renderFavorites();
    if (name === "resources")  renderResources();
  }
  // Update nav active state
  document.querySelectorAll(".nav-pill").forEach(link => {
    const sec = link.getAttribute("data-section");
    link.classList.toggle("active", sec === name);
  });
  // Scroll to content
  $("mainContent").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ──────────────────────────────────────────────────────────────────────
   HEALTH CHECK
   ────────────────────────────────────────────────────────────────────── */
async function checkHealth() {
  const dot  = $("statusDot");
  const text = $("statusText");
  try {
    const res  = await fetch("/api/health");
    const data = await res.json();
    if (data.ai_ready) {
      dot.className  = "status-dot online";
      text.textContent = `AI online · ${data.model}`;
    } else {
      dot.className  = "status-dot offline";
      text.textContent = "AI offline — check IBM credentials in .env";
    }
  } catch (_) {
    dot.className  = "status-dot offline";
    text.textContent = "Cannot reach server";
  }
}

/* ──────────────────────────────────────────────────────────────────────
   CHAT
   ────────────────────────────────────────────────────────────────────── */
function buildWelcomeBubble() {
  return `<div class="msg-wrap">
    <div class="msg-avatar ai"><i class="bi bi-journal-bookmark-fill"></i></div>
    <div>
      <div class="msg-bubble ai">
        <strong>👋 Hello! I'm Alexandria, your AI Library Assistant.</strong><br><br>
        I can help you:<br>
        📚 Discover books tailored to your interests<br>
        🗓️ Build personalized reading plans<br>
        🎯 Prepare for coding interviews &amp; exams<br>
        🔍 Search for any book or topic<br>
        ✨ Explore learning resources<br><br>
        <em>What would you like to explore today?</em>
      </div>
      <div class="msg-meta">${formatTime()}</div>
    </div>
  </div>`;
}

function appendMessage(role, content, timestamp) {
  const wrap    = document.createElement("div");
  wrap.className = `msg-wrap ${role}`;

  const avatarIcon = role === "ai" ? "bi-journal-bookmark-fill" : "bi-person-fill";
  const avatarLabel = role === "ai" ? "AI" : "U";
  const bubbleHtml  = role === "ai" ? mdToHtml(content) : escapeHtml(content);

  wrap.innerHTML = `
    <div class="msg-avatar ${role}">
      ${role === "ai" ? `<i class="bi ${avatarIcon}"></i>` : avatarLabel}
    </div>
    <div>
      <div class="msg-bubble ${role}">${bubbleHtml}</div>
      <div class="msg-meta">${formatTime(timestamp)}</div>
    </div>`;

  const container = $("chatMessages");
  container.appendChild(wrap);
  container.scrollTop = container.scrollHeight;
}

function setLoading(isLoading) {
  const indicator = $("typingIndicator");
  const sendBtn   = $("sendBtn");
  indicator.classList.toggle("d-none", !isLoading);
  sendBtn.disabled = isLoading;
  if (isLoading) {
    // scroll to show typing indicator
    const container = $("chatMessages");
    container.scrollTop = container.scrollHeight;
  }
}

async function sendMessage() {
  const input   = $("chatInput");
  const message = input.value.trim();
  if (!message) return;

  input.value = "";
  autoResizeTextarea(input);

  appendMessage("user", message);
  State.chatHistory.push({ role: "user", content: message });
  setLoading(true);

  try {
    const res  = await fetch("/api/chat", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ message, history: State.chatHistory.slice(-12) }),
    });
    const data = await res.json();

    if (data.error) {
      appendMessage("ai", `⚠️ ${data.error}`);
    } else {
      const reply = data.response || "I'm sorry, I didn't receive a valid response.";
      appendMessage("ai", reply, data.timestamp);
      State.chatHistory.push({ role: "assistant", content: reply });
    }
  } catch (err) {
    appendMessage("ai", "⚠️ Network error. Please check your connection and try again.");
  } finally {
    setLoading(false);
  }
}

function autoResizeTextarea(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 120) + "px";
}

function buildQuickChips() {
  const container = $("quickChips");
  container.innerHTML = QUICK_CHIPS.map(chip =>
    `<span class="quick-chip" onclick="useChip(this)">${chip}</span>`
  ).join("");
}

function useChip(el) {
  $("chatInput").value = el.textContent;
  sendMessage();
}

/* ──────────────────────────────────────────────────────────────────────
   READING PLAN
   ────────────────────────────────────────────────────────────────────── */
async function generatePlan() {
  const goal     = $("planGoal").value.trim();
  const level    = $("planLevel").value;
  const duration = $("planDuration").value;
  const output   = $("planOutput");

  if (!goal) { showToast("Please enter a learning goal", "warning"); return; }

  output.classList.remove("d-none");
  output.textContent = "⏳ Generating your personalized reading plan…";

  try {
    const res  = await fetch("/api/reading-plan", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ goal, level, duration }),
    });
    const data = await res.json();

    if (data.error) {
      output.textContent = `⚠️ ${data.error}`;
    } else {
      output.textContent = data.plan;
      showToast("Reading plan generated! 📚");
    }
  } catch (_) {
    output.textContent = "⚠️ Network error. Please try again.";
  }
}

/* ──────────────────────────────────────────────────────────────────────
   RECOMMENDATIONS
   ────────────────────────────────────────────────────────────────────── */
async function getRecommendations() {
  const interests = $("recInterests").value.trim();
  const level     = $("recLevel").value;
  const output    = $("recOutput");

  if (!interests) { showToast("Please enter your interests", "warning"); return; }

  output.classList.remove("d-none");
  output.textContent = "⏳ Finding great books for you…";

  try {
    const res  = await fetch("/api/recommend", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ interests, level }),
    });
    const data = await res.json();

    if (data.error) {
      output.textContent = `⚠️ ${data.error}`;
    } else {
      output.textContent = data.recommendations;
      showToast("Recommendations ready! ✨");
    }
  } catch (_) {
    output.textContent = "⚠️ Network error. Please try again.";
  }
}

/* ──────────────────────────────────────────────────────────────────────
   BOOK SEARCH
   ────────────────────────────────────────────────────────────────────── */
async function performSearch() {
  const query   = $("mainSearchInput").value.trim();
  if (!query)   { showToast("Please enter a search query", "warning"); return; }
  await runSearch(query);
}

function quickSearch(query) {
  $("mainSearchInput").value = query;
  runSearch(query);
}

async function runSearch(query) {
  $("searchLoading").classList.remove("d-none");
  $("searchResults").classList.add("d-none");
  $("searchEmpty").classList.add("d-none");

  try {
    const res  = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    $("searchLoading").classList.add("d-none");

    if (data.error) {
      $("searchResults").classList.remove("d-none");
      $("searchResults").textContent = `⚠️ ${data.error}`;
    } else {
      $("searchResults").classList.remove("d-none");
      $("searchResults").innerHTML = `<p class="text-muted small mb-2">Results for: <strong>${escapeHtml(query)}</strong></p>` +
        `<div style="white-space:pre-wrap">${mdToHtml(data.results)}</div>`;
    }
  } catch (_) {
    $("searchLoading").classList.add("d-none");
    $("searchResults").classList.remove("d-none");
    $("searchResults").textContent = "⚠️ Network error. Please try again.";
  }
}

/* ──────────────────────────────────────────────────────────────────────
   FEATURED BOOKS & DASHBOARD
   ────────────────────────────────────────────────────────────────────── */
async function loadFeaturedBooks() {
  try {
    const res  = await fetch("/api/featured-books");
    const data = await res.json();
    State.allBooks = data.books || [];
    updateStats();
  } catch (_) {
    State.allBooks = [];
  }
}

function getLevelColor(level) {
  const map = { Beginner: "#10b981", Intermediate: "#f59e0b", Advanced: "#ef4444" };
  return map[level] || "#3b82d4";
}

function buildBookCard(book) {
  const isFav   = State.favorites.includes(String(book.id));
  const isRead  = State.readHistory.some(r => String(r.id) === String(book.id));
  const stars   = "★".repeat(Math.round(book.rating)) + "☆".repeat(5 - Math.round(book.rating));

  return `<div class="col-6 col-md-4 col-lg-3" data-genre="${escapeHtml(book.genre)}">
    <div class="book-card" onclick="openBookModal(${book.id})">
      <div class="book-cover" style="background:${book.cover_color}">
        <i class="bi bi-book-fill"></i>
        <span class="book-badge" style="color:${getLevelColor(book.level)}">${book.level}</span>
      </div>
      <div class="book-body">
        <div class="book-title">${escapeHtml(book.title)}</div>
        <div class="book-author">${escapeHtml(book.author)}</div>
        <div class="book-desc">${escapeHtml(book.description)}</div>
        <div class="book-footer">
          <span class="book-rating">${stars} ${book.rating}</span>
          <div class="book-actions" onclick="event.stopPropagation()">
            <button class="btn-book-action ${isFav ? "active" : ""}"
              title="${isFav ? "Remove from favorites" : "Add to favorites"}"
              onclick="toggleFavorite(${book.id})">
              <i class="bi bi-heart${isFav ? "-fill" : ""}"></i>
            </button>
            <button class="btn-book-action ${isRead ? "read-active" : ""}"
              title="${isRead ? "Marked as read" : "Mark as read"}"
              onclick="toggleRead(${book.id})">
              <i class="bi bi-check${isRead ? "-circle-fill" : "-circle"}"></i>
            </button>
            <button class="btn-book-action"
              title="Ask Alexandria about this book"
              onclick="askAboutBookId(${book.id})">
              <i class="bi bi-chat-dots"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function renderBookGrid(genre) {
  const grid  = $("bookGrid");
  const books = genre === "All"
    ? State.allBooks
    : State.allBooks.filter(b => b.genre === genre);

  grid.innerHTML = books.length
    ? books.map(buildBookCard).join("")
    : `<div class="col-12"><div class="empty-state"><i class="bi bi-book"></i><p>No books found in this category</p></div></div>`;

  updateStats();
}

function setupFilterButtons() {
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      renderBookGrid(btn.getAttribute("data-genre"));
    });
  });
}

/* ──────────────────────────────────────────────────────────────────────
   FAVORITES
   ────────────────────────────────────────────────────────────────────── */
function toggleFavorite(id) {
  const idStr = String(id);
  if (State.favorites.includes(idStr)) {
    State.favorites = State.favorites.filter(f => f !== idStr);
    showToast("Removed from favorites", "secondary");
  } else {
    State.favorites.push(idStr);
    showToast("Added to favorites ❤️");
  }
  saveToStorage();
  // Re-render affected areas
  renderBookGrid(document.querySelector(".filter-btn.active")?.getAttribute("data-genre") || "All");
  updateStats();
}

function renderFavorites() {
  const grid  = $("favoritesGrid");
  const empty = $("favoritesEmpty");

  const favBooks = State.allBooks.filter(b => State.favorites.includes(String(b.id)));
  if (favBooks.length === 0) {
    grid.innerHTML = "";
    empty.classList.remove("d-none");
  } else {
    empty.classList.add("d-none");
    grid.innerHTML = favBooks.map(buildBookCard).join("");
  }
  updateStats();
}

/* ──────────────────────────────────────────────────────────────────────
   READING HISTORY
   ────────────────────────────────────────────────────────────────────── */
function toggleRead(id) {
  const book   = State.allBooks.find(b => String(b.id) === String(id));
  if (!book)   return;

  const isRead = State.readHistory.some(r => String(r.id) === String(id));
  if (isRead) {
    State.readHistory = State.readHistory.filter(r => String(r.id) !== String(id));
    showToast("Removed from reading history", "secondary");
  } else {
    State.readHistory.unshift({
      id:     String(id),
      title:  book.title,
      author: book.author,
      genre:  book.genre,
      level:  book.level,
      date:   new Date().toISOString(),
    });
    showToast(`Marked "${book.title}" as read ✅`);
  }
  saveToStorage();
  renderBookGrid(document.querySelector(".filter-btn.active")?.getAttribute("data-genre") || "All");
  updateStats();
}

function renderHistory() {
  const list  = $("historyList");
  const empty = $("historyEmpty");

  if (State.readHistory.length === 0) {
    list.innerHTML = "";
    empty.classList.remove("d-none");
    return;
  }
  empty.classList.add("d-none");
  list.innerHTML = State.readHistory.map(r => `
    <div class="history-item">
      <div class="history-dot"></div>
      <div class="history-info">
        <div class="history-title">${escapeHtml(r.title)}</div>
        <div class="history-meta">${escapeHtml(r.author)} · ${escapeHtml(r.genre)} · ${escapeHtml(r.level)}</div>
      </div>
      <div class="history-date">${formatDate(r.date)}</div>
      <button class="btn btn-sm btn-outline-danger ms-2" onclick="removeFromHistory('${r.id}')" title="Remove">
        <i class="bi bi-x"></i>
      </button>
    </div>`
  ).join("");
}

function removeFromHistory(id) {
  State.readHistory = State.readHistory.filter(r => r.id !== id);
  saveToStorage();
  renderHistory();
  updateStats();
  // Refresh book grid button states
  renderBookGrid(document.querySelector(".filter-btn.active")?.getAttribute("data-genre") || "All");
}

function clearHistory() {
  if (!confirm("Clear all reading history?")) return;
  State.readHistory = [];
  saveToStorage();
  renderHistory();
  updateStats();
  renderBookGrid(document.querySelector(".filter-btn.active")?.getAttribute("data-genre") || "All");
  showToast("History cleared", "secondary");
}

/* ──────────────────────────────────────────────────────────────────────
   LEARNING RESOURCES
   ────────────────────────────────────────────────────────────────────── */
const RESOURCE_ICONS = {
  Course:    { icon: "bi-play-circle-fill", bg: "#3b82d4" },
  Platform:  { icon: "bi-grid-fill",        bg: "#7c5cd8" },
  Courses:   { icon: "bi-mortarboard-fill", bg: "#10b981" },
  Curriculum:{ icon: "bi-list-check",       bg: "#f59e0b" },
  Practice:  { icon: "bi-code-slash",       bg: "#ef4444" },
  Research:  { icon: "bi-journal-text",     bg: "#06b6d4" },
};

function getLevelClass(level) {
  if (!level) return "level-all";
  const map = { "Beginner": "level-beginner", "Intermediate": "level-intermediate", "Advanced": "level-advanced", "All Levels": "level-all" };
  return map[level] || "level-all";
}

async function renderResources() {
  const grid = $("resourcesGrid");
  grid.innerHTML = `<div class="col-12 text-center py-4"><div class="spinner-border text-primary"></div></div>`;

  try {
    const res  = await fetch("/api/learning-resources");
    const data = await res.json();
    const resources = data.resources || [];

    grid.innerHTML = resources.map(r => {
      const meta = RESOURCE_ICONS[r.type] || { icon: "bi-link-45deg", bg: "#57606a" };
      return `<div class="col-12 col-sm-6 col-md-4 col-lg-3">
        <div class="resource-card">
          <div class="resource-icon" style="background:${meta.bg}20;color:${meta.bg}">
            <i class="bi ${meta.icon}"></i>
          </div>
          <div class="resource-title">${escapeHtml(r.title)}</div>
          <div class="resource-type">${escapeHtml(r.type)}</div>
          <span class="resource-level ${getLevelClass(r.level)}">${escapeHtml(r.level)}</span>
          <div class="mt-auto">
            <a href="${escapeHtml(r.url)}" target="_blank" rel="noopener"
               class="btn btn-outline-primary btn-sm w-100" onclick="event.stopPropagation()">
              <i class="bi bi-box-arrow-up-right me-1"></i>Visit
            </a>
          </div>
        </div>
      </div>`;
    }).join("");
  } catch (_) {
    grid.innerHTML = `<div class="col-12"><div class="empty-state"><i class="bi bi-wifi-off"></i><p>Could not load resources</p></div></div>`;
  }
}

/* ──────────────────────────────────────────────────────────────────────
   BOOK MODAL
   ────────────────────────────────────────────────────────────────────── */
function openBookModal(id) {
  const book = State.allBooks.find(b => b.id === id);
  if (!book) return;
  State.currentBook = book;

  $("bookModalTitle").textContent = book.title;
  $("bookModalBody").innerHTML = `
    <div class="d-flex gap-3 mb-3">
      <div style="width:70px;height:90px;border-radius:8px;background:${book.cover_color};
           display:flex;align-items:center;justify-content:center;
           color:rgba(255,255,255,.9);font-size:1.8rem;flex-shrink:0">
        <i class="bi bi-book-fill"></i>
      </div>
      <div>
        <p class="mb-1"><strong>Author:</strong> ${escapeHtml(book.author)}</p>
        <p class="mb-1"><strong>Genre:</strong> ${escapeHtml(book.genre)}</p>
        <p class="mb-1"><strong>Level:</strong> <span style="color:${getLevelColor(book.level)};font-weight:600">${escapeHtml(book.level)}</span></p>
        <p class="mb-0"><strong>Rating:</strong> <span style="color:#f59e0b">★</span> ${book.rating}</p>
      </div>
    </div>
    <p class="text-muted">${escapeHtml(book.description)}</p>`;

  bootstrap.Modal.getOrCreateInstance($("bookModal")).show();
}

function askAboutBook() {
  if (!State.currentBook) return;
  bootstrap.Modal.getOrCreateInstance($("bookModal")).hide();
  showSection("chat");
  $("chatInput").value = `Tell me more about "${State.currentBook.title}" by ${State.currentBook.author}`;
  sendMessage();
}

function askAboutBookId(id) {
  const book = State.allBooks.find(b => b.id === id);
  if (!book) return;
  showSection("chat");
  $("chatInput").value = `Tell me more about "${book.title}" by ${book.author}`;
  sendMessage();
}

/* ──────────────────────────────────────────────────────────────────────
   STATS
   ────────────────────────────────────────────────────────────────────── */
function updateStats() {
  $("statBooks").textContent    = State.allBooks.length;
  $("statRead").textContent     = State.readHistory.length;
  $("statFavs").textContent     = State.favorites.length;
}

/* ──────────────────────────────────────────────────────────────────────
   KEYBOARD SHORTCUTS
   ────────────────────────────────────────────────────────────────────── */
function setupKeyboardShortcuts() {
  $("chatInput").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  $("chatInput").addEventListener("input", function () { autoResizeTextarea(this); });
  $("mainSearchInput").addEventListener("keydown", e => {
    if (e.key === "Enter") performSearch();
  });
}

/* ──────────────────────────────────────────────────────────────────────
   NAV CLICK WIRING
   ────────────────────────────────────────────────────────────────────── */
function setupNavLinks() {
  document.querySelectorAll(".nav-pill[data-section]").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      showSection(link.getAttribute("data-section"));
    });
  });
}

/* ──────────────────────────────────────────────────────────────────────
   INIT
   ────────────────────────────────────────────────────────────────────── */
async function init() {
  loadFromStorage();
  applyTheme();

  $("themeToggle").addEventListener("click", toggleTheme);
  setupNavLinks();
  setupKeyboardShortcuts();
  setupFilterButtons();
  buildQuickChips();

  // Welcome message in chat
  $("chatMessages").innerHTML = buildWelcomeBubble();

  // Load data in parallel
  await Promise.allSettled([
    loadFeaturedBooks(),
    checkHealth(),
  ]);

  // Show default section
  showSection("chat");
}

document.addEventListener("DOMContentLoaded", init);
