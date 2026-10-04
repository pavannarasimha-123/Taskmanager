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
  if (error) return showMsg(error.message);
  todos = data;
}

async function addTodo() {
  const input = $("todoInput");
  const text = input.value.trim();
  if (!text) return;
  if (db && !user) return showMsg("Sign in to add tasks.");

  if (db) {
    const { error } = await db.from("tasks").insert({ text });
    if (error) return showMsg(error.message);
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
    if (error) return showMsg(error.message);
  } else {
    todo.completed = !todo.completed;
    saveLocal();
  }
  await refresh();
}

async function deleteTodo(id) {
  if (db) {
    const { error } = await db.from("tasks").delete().eq("id", id);
    if (error) return showMsg(error.message);
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

// ---------- Auth ----------
function showMsg(msg) {
  $("authMsg").textContent = msg || "";
  if (!db) console.warn(msg);
}

function renderAuth() {
  if (!db) return; // local mode: auth UI stays hidden
  $("authSection").hidden = false;
  $("authForm").hidden = !!user;
  $("authUser").hidden = !user;
  if (user) $("authUserEmail").textContent = user.email;
}

async function signIn() {
  showMsg("");
  const { error } = await db.auth.signInWithPassword({
    email: $("authEmail").value.trim(),
    password: $("authPassword").value,
  });
  if (error) showMsg(error.message);
}

async function signUp() {
  showMsg("");
  const { data, error } = await db.auth.signUp({
    email: $("authEmail").value.trim(),
    password: $("authPassword").value,
  });
  if (error) return showMsg(error.message);
  if (!data.session) showMsg("Check your email to confirm your account, then sign in.");
}

async function onAuthChange(session) {
  user = session ? session.user : null;
  renderAuth();
  if (user) await importLocalTodos();
  await refresh();
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
  $("signInBtn").addEventListener("click", signIn);
  $("signUpBtn").addEventListener("click", signUp);
  $("signOutBtn").addEventListener("click", () => db.auth.signOut());
  $("authPassword").addEventListener("keypress", (e) => {
    if (e.key === "Enter") signIn();
  });
  db.auth.onAuthStateChange((_event, session) => {
    // defer to avoid calling Supabase inside its own auth callback
    setTimeout(() => onAuthChange(session), 0);
  });
  renderAuth();
} else {
  refresh();
}
