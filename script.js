// ---------- Setup ----------
const configured =
  window.SUPABASE_URL &&
  window.SUPABASE_ANON_KEY &&
  !window.SUPABASE_URL.startsWith("YOUR_");
const db = configured
  ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)
  : null;

let todos = [];
let currentFilter = "all";
let user = null;

const $ = (id) => document.getElementById(id);

// ---------- Local mode (no Supabase configured) ----------
function loadLocal() {
  try {
    return JSON.parse(localStorage.getItem("todos")) || [];
  } catch (e) {
    return [];
  }
}
function saveLocal() {
  localStorage.setItem("todos", JSON.stringify(todos));
}
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ---------- Data layer ----------
function showAppError(msg) {
  const el = $("appMsg");
  if (el) el.textContent = msg ? "Error: " + msg : "";
}

async function loadTodos() {
  if (!db) {
    todos = loadLocal();
    todos.forEach((t) => { if (!t.id) t.id = newId(); });
    return;
  }
  if (!user) {
    todos = [];
    return;
  }
  const { data, error } = await db
    .from("tasks")
    .select("id, text, completed")
    .order("created_at", { ascending: true });
  if (error) return showAppError(error.message);
  todos = data;
}

async function addTodo() {
  const input = $("todoInput");
  const text = input.value.trim();
  if (!text) return;
  if (db && !user) return showAppError("Sign in to add tasks.");

  if (db) {
    const { error } = await db.from("tasks").insert({ text });
    if (error) return showAppError(error.message);
  } else {
    todos.push({ id: newId(), text, completed: false });
    saveLocal();
  }
  input.value = "";
  await refresh();
}

async function toggleTodo(id) {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;
  if (db) {
    const { error } = await db.from("tasks").update({ completed: !todo.completed }).eq("id", id);
    if (error) return showAppError(error.message);
  } else {
    todo.completed = !todo.completed;
    saveLocal();
  }
  await refresh();
}

async function deleteTodo(id) {
  if (db) {
    const { error } = await db.from("tasks").delete().eq("id", id);
    if (error) return showAppError(error.message);
  } else {
    todos = todos.filter((t) => t.id !== id);
    saveLocal();
  }
  await refresh();
}

// One-time import of tasks saved in this browser before sync was added
async function importLocalTodos() {
  const local = loadLocal();
  if (!db || !user || local.length === 0) return;
  const rows = local.map((t) => ({ text: t.text, completed: !!t.completed }));
  const { error } = await db.from("tasks").insert(rows);
  if (!error) localStorage.removeItem("todos");
}

async function refresh() {
  showAppError("");
  await loadTodos();
  renderTodos();
}

// ---------- Rendering ----------
function renderTodos() {
  const todoList = $("todoList");
  todoList.innerHTML = "";

  todos
    .filter((todo) => {
      if (currentFilter === "completed") return todo.completed;
      if (currentFilter === "pending") return !todo.completed;
      return true;
    })
    .forEach((todo) => {
      const li = document.createElement("li");
      if (todo.completed) li.classList.add("completed");

      const content = document.createElement("div");
      content.className = "todo-content";
      const span = document.createElement("span");
      span.className = "todo-text";
      span.textContent = todo.text;
      content.appendChild(span);

      const actions = document.createElement("div");
      actions.className = "todo-actions";

      const toggleBtn = document.createElement("button");
      toggleBtn.className = "action-btn complete-btn";
      toggleBtn.innerHTML = `<i class="fas ${todo.completed ? "fa-rotate-left" : "fa-check"}"></i>`;
      toggleBtn.addEventListener("click", () => toggleTodo(todo.id));

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "action-btn delete-btn";
      deleteBtn.innerHTML = `<i class="fas fa-trash"></i>`;
      deleteBtn.addEventListener("click", () => deleteTodo(todo.id));

      actions.append(toggleBtn, deleteBtn);
      li.append(content, actions);
      todoList.appendChild(li);
    });
}

// ---------- Auth (login / register page) ----------
let mode = "login"; // "login" | "register"

function showMsg(msg, ok = false) {
  const el = $("authMsg");
  el.textContent = msg || "";
  el.classList.toggle("success", ok);
}

function setMode(next) {
  mode = next;
  const reg = mode === "register";
  $("tabLogin").classList.toggle("active", !reg);
  $("tabRegister").classList.toggle("active", reg);
  $("confirmField").hidden = !reg;
  $("authConfirm").required = reg;
  $("authPassword").autocomplete = reg ? "new-password" : "current-password";
  $("authSubtitle").textContent = reg
    ? "Create an account to sync your tasks"
    : "Welcome back! Sign in to your tasks";
  $("authSubmit").querySelector("span").textContent = reg ? "Create account" : "Login";
  $("authSubmit").querySelector("i").className = reg
    ? "fas fa-user-plus"
    : "fas fa-right-to-bracket";
  showMsg("");
}

function showView(which) {
  $("authView").hidden = which !== "auth";
  $("appView").hidden = which !== "app";
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  showMsg("");
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;

  if (!email || !password) return showMsg("Enter your email and password.");
  if (mode === "register") {
    if (password.length < 6) return showMsg("Password must be at least 6 characters.");
    if (password !== $("authConfirm").value) return showMsg("Passwords do not match.");
  }

  const btn = $("authSubmit");
  btn.disabled = true;
  try {
    if (mode === "login") {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) showMsg(error.message);
    } else {
      const { data, error } = await db.auth.signUp({ email, password });
      if (error) return showMsg(error.message);
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        return showMsg("This email is already registered. Please log in.");
      }
      if (!data.session) {
        setMode("login");
        showMsg("Account created! Check your email to confirm, then log in.", true);
      }
    }
  } finally {
    btn.disabled = false;
  }
}

async function onAuthChange(session) {
  user = session ? session.user : null;
  if (user) {
    $("userEmail").textContent = user.email;
    $("userBar").hidden = false;
    showView("app");
    await importLocalTodos();
    await refresh();
  } else {
    todos = [];
    renderTodos();
    $("authPassword").value = "";
    $("authConfirm").value = "";
    showView("auth");
  }
}

// ---------- Events ----------
$("todoInput").addEventListener("keypress", (e) => {
  if (e.key === "Enter") addTodo();
});

document.querySelector(".filters").addEventListener("click", (e) => {
  const filterBtn = e.target.closest(".filter-btn");
  if (!filterBtn) return;
  document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
  filterBtn.classList.add("active");
  currentFilter = filterBtn.dataset.filter;
  renderTodos();
});

// ---------- Init ----------
if (db) {
  $("tabLogin").addEventListener("click", () => setMode("login"));
  $("tabRegister").addEventListener("click", () => setMode("register"));
  $("authFormEl").addEventListener("submit", handleAuthSubmit);
  $("logoutBtn").addEventListener("click", () => db.auth.signOut());
  $("togglePw").addEventListener("click", () => {
    const pw = $("authPassword");
    const show = pw.type === "password";
    pw.type = show ? "text" : "password";
    $("togglePw").querySelector("i").className = show ? "fas fa-eye-slash" : "fas fa-eye";
  });
  db.auth.onAuthStateChange((_event, session) => {
    // defer to avoid calling Supabase inside its own auth callback
    setTimeout(() => onAuthChange(session), 0);
  });
} else {
  // Local-only mode: no login needed
  showView("app");
  refresh();
}
