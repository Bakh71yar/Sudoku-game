const DIFFICULTIES = {
  easy: {
    title: "Легкий",
    remove: 38,
    target: "5-8 минут",
    description:
      "Больше открытых цифр, спокойный старт и меньше риска застрять.",
  },
  medium: {
    title: "Средний",
    remove: 46,
    target: "8-12 минут",
    description:
      "Баланс скорости и логики, хороший режим для ежедневной тренировки.",
  },
  hard: {
    title: "Сложный",
    remove: 54,
    target: "12-18 минут",
    description: "Меньше подсказок на поле, больше пользы от заметок и Coach.",
  },
  expert: {
    title: "Эксперт",
    remove: 58,
    target: "18-25 минут",
    description:
      "Pro-режим для сильных игроков: больше пустых клеток и выше ценность notes.",
    pro: true,
  },
  master: {
    title: "Мастер",
    remove: 62,
    target: "25+ минут",
    description:
      "Максимальная Pro-дорожка для глубокого фокуса, терпения и AI-разбора.",
    pro: true,
  },
};

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBxt9tUSMMF-o9i1ZMJT6FiF26HQaZL4M8",
  authDomain: "sudokugame-821f6.firebaseapp.com",
  projectId: "sudokugame-821f6",
  storageBucket: "sudokugame-821f6.firebasestorage.app",
  messagingSenderId: "565907209385",
  appId: "1:565907209385:web:b7f34d4fbb3db629cb7db8",
  measurementId: "G-ZLPBT4V55Z",
};

const AI_COACH_ENDPOINT = "http://127.0.0.1:8787/api/coach";
const AI_DEPLOYED_ENDPOINT = "/api/coach";
const GROQ_DIRECT_API_KEY = "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";
const GROQ_DIRECT_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_DIRECT_MODEL = "llama-3.3-70b-versatile";
const FREE_DAILY_HINT_LIMIT = 3;
const FREE_DAILY_AI_LIMIT = 3;
const FREE_DAILY_PUZZLE_LIMIT = 1;
const INVITES_FOR_PRO = 3;
const CLEAN_SOLVES_FOR_TRIAL = 10;
const PRO_TRIAL_DAYS = 7;
const PRO_LEVELS = new Set(["expert", "master"]);

const PUZZLES = buildPuzzleCatalog();

const state = {
  selected: null,
  puzzleKey: "medium",
  currentPuzzle: null,
  noteMode: false,
  timerId: null,
  seconds: 0,
  mistakes: 0,
  board: [],
  notes: {},
  hintLog: [],
  mistakeLog: [],
};

const AUTH_METHOD_LABELS = {
  google: "Google",
  email: "Почта",
  guest: "Гость",
};

const AVATAR_LABELS = {
  mint: "🧠",
  blue: "⚡",
  gold: "👑",
  coral: "🔥",
  dark: "🌙",
  comet: "☄",
  mask: "◈",
  sharingan: "◉",
  infinity: "∞",
  straw: "☠",
  alchemy: "△",
  spirit: "✦",
};

const BASE_AVATARS = ["mint", "blue", "gold", "coral", "dark", "comet", "mask"];
const PRO_AVATARS = [
  ["sharingan", "Наруто: шаринган"],
  ["infinity", "Магическая битва: бесконечность"],
  ["straw", "One Piece: пиратская воля"],
  ["alchemy", "Fullmetal Alchemist: алхимия"],
  ["spirit", "Spirited Away: дух"],
];

function seededRandom(seed) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return function next() {
    hash += hash << 13;
    hash ^= hash >>> 7;
    hash += hash << 3;
    hash ^= hash >>> 17;
    hash += hash << 5;
    return (hash >>> 0) / 4294967296;
  };
}

function shuffleWithSeed(items, seed) {
  const values = [...items];
  const random = seededRandom(seed);
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

function buildSolvedGrid(seed) {
  const random = seededRandom(seed);
  const pattern = (row, col) => (row * 3 + Math.floor(row / 3) + col) % 9;
  const rows = shuffleWithSeed([0, 1, 2], `${seed}:bands`).flatMap((band) => {
    return shuffleWithSeed([0, 1, 2], `${seed}:row:${band}`).map(
      (row) => band * 3 + row,
    );
  });
  const cols = shuffleWithSeed([0, 1, 2], `${seed}:stacks`).flatMap((stack) => {
    return shuffleWithSeed([0, 1, 2], `${seed}:col:${stack}`).map(
      (col) => stack * 3 + col,
    );
  });
  const nums = shuffleWithSeed([1, 2, 3, 4, 5, 6, 7, 8, 9], `${seed}:nums`);
  if (random() > 0.5) rows.reverse();
  if (random() > 0.5) cols.reverse();
  return rows
    .flatMap((row) => cols.map((col) => String(nums[pattern(row, col)])))
    .join("");
}

function createPuzzle(level, index, seedOverride) {
  const meta = DIFFICULTIES[level] || DIFFICULTIES.medium;
  const seed = seedOverride || `${level}:${index}`;
  const solution = buildSolvedGrid(seed);
  const holes = shuffleWithSeed(
    Array.from({ length: 81 }, (_, i) => i),
    `${seed}:holes`,
  ).slice(0, meta.remove);
  const puzzle = solution.split("");
  holes.forEach((position) => {
    puzzle[position] = "0";
  });
  return {
    id: seedOverride ? seed : `${level}-${index}`,
    level,
    index,
    title: seedOverride ? "Daily Challenge" : `${meta.title} #${index}`,
    puzzle: puzzle.join(""),
    solution,
    description: meta.description,
  };
}

function buildPuzzleCatalog() {
  const catalog = {};
  Object.keys(DIFFICULTIES).forEach((level) => {
    const seen = new Set();
    catalog[level] = Array.from({ length: 50 }, (_, index) => {
      let puzzle = createPuzzle(level, index + 1);
      let salt = 0;
      while (seen.has(puzzle.puzzle) && salt < 10) {
        salt += 1;
        puzzle = createPuzzle(
          level,
          index + 1,
          `${level}:${index + 1}:retry:${salt}`,
        );
      }
      seen.add(puzzle.puzzle);
      return puzzle;
    });
  });
  return catalog;
}

function createBlankStats() {
  return {
    totalSeconds: 0,
    completed: 0,
    leaderboardRank: 0,
    averageSeconds: 0,
    streak: 0,
    accuracy: 0,
    xp: 0,
    pro: false,
    proSource: "",
    proTrialUntil: "",
    invitedFriends: [],
    cleanNoHintPuzzles: {},
    lastStreakDate: "",
    theme: "light",
    completedPuzzles: {},
    aiReviewLog: [],
    dailyStats: {},
    dailyHintUsage: {},
    dailyAiUsage: {},
    dailyPuzzlePlays: {},
  };
}

function createUserProfile({ id, name, city, method, email, avatarId }) {
  return {
    schemaVersion: 2,
    id,
    name,
    city,
    method,
    email,
    avatarId,
    signedIn: true,
    createdAt: new Date().toISOString(),
    ...createBlankStats(),
  };
}

function normalizeUser(raw) {
  if (!raw || raw.schemaVersion !== 2) {
    return {
      schemaVersion: 2,
      id: "guest-local",
      name: raw?.name || "Гость",
      city: raw?.city || "Алматы",
      method: raw?.signedIn ? "email" : "guest",
      email: raw?.email || "",
      avatarId: raw?.avatarId || "mint",
      signedIn: Boolean(raw?.signedIn),
      createdAt: raw?.createdAt || new Date().toISOString(),
      ...createBlankStats(),
    };
  }
  return {
    ...createUserProfile({
      id: raw.id || "guest-local",
      name: raw.name || "Гость",
      city: raw.city || "Алматы",
      method: raw.method || "guest",
      email: raw.email || "",
      avatarId: raw.avatarId || "mint",
    }),
    ...raw,
    dailyStats: raw.dailyStats || {},
    dailyHintUsage: raw.dailyHintUsage || {},
    dailyAiUsage: raw.dailyAiUsage || {},
    dailyPuzzlePlays: raw.dailyPuzzlePlays || {},
    completedPuzzles: raw.completedPuzzles || {},
    aiReviewLog: raw.aiReviewLog || [],
    xp: raw.xp || 0,
    pro: Boolean(raw.pro),
    proSource: raw.proSource || "",
    proTrialUntil: raw.proTrialUntil || "",
    invitedFriends: Array.isArray(raw.invitedFriends) ? raw.invitedFriends : [],
    cleanNoHintPuzzles: raw.cleanNoHintPuzzles || {},
    lastStreakDate: raw.lastStreakDate || "",
    theme: raw.theme || "light",
  };
}

function getUser() {
  const saved = localStorage.getItem("sudokuUser");
  const raw = saved ? JSON.parse(saved) : null;
  const user = normalizeUser(raw);
  if (!isValidAvatar(user.avatarId)) {
    user.avatarId = "mint";
    saveUser(user);
  }
  if (!saved || user.schemaVersion !== raw?.schemaVersion) saveUser(user);
  return user;
}

function saveUser(user) {
  const normalized = normalizeUser(user);
  localStorage.setItem("sudokuUser", JSON.stringify(normalized));
  if (normalized.id) {
    const accounts = getAccounts();
    accounts[normalized.id] = normalized;
    localStorage.setItem("sudokuAccounts", JSON.stringify(accounts));
    localStorage.setItem("sudokuCurrentAccountId", normalized.id);
  }
}

function getAccounts() {
  return JSON.parse(localStorage.getItem("sudokuAccounts") || "{}");
}

function findAccount(id) {
  return getAccounts()[id] || null;
}

function accountIdFor(method, email) {
  if (method === "guest")
    return `guest:${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
  return `${method}:${email.trim().toLowerCase()}`;
}

function getLocalResults() {
  return JSON.parse(localStorage.getItem("sudokuResults") || "[]");
}

function puzzleProgressKey(puzzle = state.currentPuzzle) {
  if (!puzzle || puzzle.id.startsWith("daily:")) return "";
  return `${puzzle.level}-${puzzle.index}`;
}

function isPuzzleCompleted(user, puzzle) {
  const key = puzzleProgressKey(puzzle);
  return Boolean(key && user.completedPuzzles?.[key]);
}

function focusRank(xp = 0) {
  if (xp >= 2500) return "Legend";
  if (xp >= 1200) return "Master";
  if (xp >= 600) return "Strategist";
  if (xp >= 250) return "Builder";
  if (xp >= 80) return "Starter";
  return "New Mind";
}

function avatarButtonMarkup(id, selected, locked = false, label = "") {
  return `
    <button
      class="avatar-option ${id} ${selected === id ? "active" : ""} ${locked ? "locked" : ""}"
      type="button"
      data-profile-avatar="${id}"
      ${locked ? "data-locked-avatar=\"true\"" : ""}
      title="${escapeHtml(label || id)}"
      aria-label="${escapeHtml(label || id)}"
    >
      ${AVATAR_LABELS[id] || "?"}
    </button>
  `;
}

function profileAvatarPickerMarkup(user) {
  const base = BASE_AVATARS.map((id) =>
    avatarButtonMarkup(id, user.avatarId, false, "Базовая аватарка"),
  ).join("");
  const pro = PRO_AVATARS.map(([id, label]) =>
    avatarButtonMarkup(id, user.avatarId, !isProUser(user), label),
  ).join("");
  return `
    <section class="card" style="grid-column: 1 / -1;">
      <h3>Сменить аватарку</h3>
      <p>Pro открывает 7 anime-inspired аватарок: шаринган, бесконечность, пиратская воля, алхимия и другие.</p>
      <div class="avatar-picker profile-avatar-picker">
        ${base}
        ${pro}
      </div>
      ${isProUser(user) ? "" : `<p class="locked-note">Pro-аватарки откроются после активации Pro.</p>`}
    </section>
  `;
}

function earnProMarkup(user = getUser()) {
  const inviteCount = Math.min(INVITES_FOR_PRO, (user.invitedFriends || []).length);
  const cleanCount = Math.min(CLEAN_SOLVES_FOR_TRIAL, cleanSolveCount(user));
  return `
    <p class="eyebrow">Заработать Pro</p>
    <h3>${proStatusText(user)}</h3>
    <div class="earn-grid">
      <article>
        <strong>Invite ${INVITES_FOR_PRO} friends → Get Pro</strong>
        <p>Пригласите 3 друзей через свой код. Когда счетчик дойдет до 3, Pro активируется.</p>
        <div class="progress"><span style="width: ${(inviteCount / INVITES_FOR_PRO) * 100}%"></span></div>
        <span class="earn-count">${inviteCount}/${INVITES_FOR_PRO} друзей</span>
        <div class="invite-row">
          <code>${referralCode(user)}</code>
          <input data-invite-friend type="text" placeholder="email или username друга">
          <button class="button accent" type="button" data-add-invite>Добавить</button>
        </div>
      </article>
      <article>
        <strong>10 уровней без подсказок → Pro trial</strong>
        <p>Решайте уровни без Hint. После 10 clean solves откроется Pro trial на ${PRO_TRIAL_DAYS} дней.</p>
        <div class="progress"><span style="width: ${(cleanCount / CLEAN_SOLVES_FOR_TRIAL) * 100}%"></span></div>
        <span class="earn-count">${cleanCount}/${CLEAN_SOLVES_FOR_TRIAL} clean solves</span>
        <a class="button secondary" href="difficulties.html">Открыть уровни</a>
      </article>
    </div>
  `;
}

function renderEarnProBlocks() {
  document.querySelectorAll("[data-earn-pro]").forEach((root) => {
    root.innerHTML = earnProMarkup(getUser());
  });
  bindEarnProActions();
}

function bindEarnProActions() {
  document.querySelectorAll("[data-add-invite]").forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      const container = button.closest("[data-earn-pro]") || button.closest(".card");
      const input = container?.querySelector("[data-invite-friend]");
      const friend = normalizeInvite(input?.value);
      if (!friend) {
        toast("Введите email или username друга.");
        return;
      }
      const user = getUser();
      user.invitedFriends = user.invitedFriends || [];
      if (user.invitedFriends.includes(friend)) {
        toast("Этот друг уже засчитан.");
        return;
      }
      user.invitedFriends.push(friend);
      if (user.invitedFriends.length >= INVITES_FOR_PRO && !user.pro) {
        user.pro = true;
        user.proSource = "invite";
        toast("3 друга приглашены. Pro активирован.");
      } else {
        toast(`Друг засчитан: ${user.invitedFriends.length}/${INVITES_FOR_PRO}.`);
      }
      saveUser(user);
      saveFirebaseProfile(user);
      updateTopbar();
      renderProfile();
      renderEarnProBlocks();
    });
  });
}

function isValidAvatar(avatarId) {
  return BASE_AVATARS.includes(avatarId) || PRO_AVATARS.some(([id]) => id === avatarId);
}

function isProUser(user = getUser()) {
  return Boolean(user.pro || (user.proTrialUntil && new Date(user.proTrialUntil) > new Date()));
}

function proStatusText(user = getUser()) {
  if (user.pro) return user.proSource === "invite" ? "Pro заработан за приглашения" : "Pro активен";
  if (isProUser(user)) {
    return `Pro trial до ${new Date(user.proTrialUntil).toLocaleDateString("ru-RU")}`;
  }
  return "Free";
}

function cleanSolveCount(user = getUser()) {
  return Object.keys(user.cleanNoHintPuzzles || {}).length;
}

function referralCode(user = getUser()) {
  return `MS-${String(user.id || user.name || "PLAYER").replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase() || "PLAYER"}`;
}

function normalizeInvite(value) {
  return String(value || "").trim().toLowerCase();
}

function trialEndDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function nextPuzzleUrl(puzzle = state.currentPuzzle) {
  if (!puzzle || puzzle.id.startsWith("daily:")) return "difficulties.html";
  const nextIndex = puzzle.index >= 50 ? 1 : puzzle.index + 1;
  const nextLevel =
    puzzle.index >= 50
      ? Object.keys(DIFFICULTIES)[
          (Object.keys(DIFFICULTIES).indexOf(puzzle.level) + 1) %
            Object.keys(DIFFICULTIES).length
        ]
      : puzzle.level;
  return `daily.html?level=${nextLevel}&task=${nextIndex}`;
}

function saveLocalResult(result) {
  const results = getLocalResults().filter((item) => {
    return !(
      item.userId === result.userId &&
      item.date === result.date &&
      item.puzzleId === result.puzzleId
    );
  });
  results.push(result);
  localStorage.setItem("sudokuResults", JSON.stringify(results));
}

let firebaseServicesPromise = null;
let firebaseReady = false;

async function getFirebaseServices() {
  if (!firebaseServicesPromise) {
    firebaseServicesPromise = Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js"),
      import("https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js"),
    ]).then(async ([appModule, authModule, firestoreModule]) => {
      const app = appModule.initializeApp(FIREBASE_CONFIG);
      const auth = authModule.getAuth(app);
      await authModule.setPersistence(auth, authModule.browserLocalPersistence);
      const provider = new authModule.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      return {
        app,
        auth,
        provider,
        authModule,
        db: firestoreModule.getFirestore(app),
        firestoreModule,
      };
    });
  }
  const services = await firebaseServicesPromise;
  firebaseReady = true;
  return services;
}

function firebaseAuthErrorMessage(error) {
  const code = error?.code || "";
  const message = error?.message || "Unknown Firebase error";
  if (code === "auth/popup-blocked") {
    return "Popup заблокирован браузером. Используем вход через redirect в этом же окне.";
  }
  if (
    code === "auth/popup-closed-by-user" ||
    code === "auth/cancelled-popup-request"
  ) {
    return "Google окно было закрыто до завершения входа.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Этот способ входа не включен в Firebase Console: Authentication -> Sign-in method.";
  }
  if (code === "auth/email-already-in-use") return "Эта почта уже зарегистрирована. Введите правильный пароль.";
  if (code === "auth/wrong-password" || code === "auth/invalid-credential") return "Неверная почта или пароль.";
  if (code === "auth/weak-password") return "Пароль слишком слабый. Используйте минимум 6 символов.";
  if (code === "auth/unauthorized-domain") {
    return "Домен не разрешен в Firebase Auth. Добавьте localhost в Authentication -> Settings -> Authorized domains.";
  }
  if (code === "auth/configuration-not-found") {
    return "Firebase Authentication еще не настроен для этого проекта. Откройте Authentication и нажмите Get started.";
  }
  if (message.includes("Failed to fetch") || message.includes("network")) {
    return "Firebase SDK не загрузился. Проверьте интернет и доступ к gstatic/firebase.";
  }
  return `Google вход не прошел: ${code || message}`;
}

async function signInWithGoogleProfile({ name, city, avatarId }) {
  const services = await getFirebaseServices();
  const pending = {
    name,
    city,
    avatarId,
    startedAt: new Date().toISOString(),
  };
  localStorage.setItem("sudokuPendingGoogleProfile", JSON.stringify(pending));
  try {
    setAuthStatus("Открываем Google popup...");
    const result = await services.authModule.signInWithPopup(
      services.auth,
      services.provider,
    );
    await applyFirebaseGoogleUser(result.user);
  } catch (error) {
    if (error?.code !== "auth/popup-blocked") throw error;
    setAuthStatus("Popup заблокирован. Переходим через redirect...");
    await services.authModule.signInWithRedirect(
      services.auth,
      services.provider,
    );
  }
}

function profileFromFirebaseUser(firebaseUser, pending = {}) {
  const id = `google:${firebaseUser.uid}`;
  const user =
    findAccount(id) ||
    createUserProfile({
      id,
      name:
        pending.name ||
        firebaseUser.displayName ||
        firebaseUser.email ||
        "Google Player",
      city: pending.city || "Алматы",
      method: "google",
      email: firebaseUser.email || "",
      avatarId: pending.avatarId || "mint",
    });
  user.name =
    pending.name ||
    user.name ||
    firebaseUser.displayName ||
    firebaseUser.email ||
    "Google Player";
  user.city = pending.city || user.city || "Алматы";
  user.method = "google";
  user.email = firebaseUser.email || user.email || "";
  user.avatarId = pending.avatarId || user.avatarId || "mint";
  user.firebaseUid = firebaseUser.uid;
  user.photoURL = firebaseUser.photoURL || "";
  return user;
}

async function finishGoogleRedirectIfNeeded() {
  if (document.body.dataset.page !== "login") return;
  try {
    const services = await getFirebaseServices();
    const result = await services.authModule.getRedirectResult(services.auth);
    setAuthStatus(
      result?.user
        ? "Google вернул пользователя."
        : "Ждем ответ Firebase Auth...",
    );
    if (result?.user) {
      await applyFirebaseGoogleUser(result.user);
      return;
    }
    services.authModule.onAuthStateChanged(
      services.auth,
      async (firebaseUser) => {
        setAuthStatus(
          firebaseUser
            ? "Google вход подтвержден."
            : "Firebase пока не видит Google пользователя.",
        );
        if (!firebaseUser) return;
        const current = getUser();
        const expectedId = `google:${firebaseUser.uid}`;
        if (current.id === expectedId && current.signedIn) return;
        await applyFirebaseGoogleUser(firebaseUser);
      },
    );
  } catch (error) {
    console.error(error);
    toast(firebaseAuthErrorMessage(error));
  }
}

async function checkFirebaseSession() {
  try {
    const services = await getFirebaseServices();
    const firebaseUser = services.auth.currentUser;
    if (!firebaseUser) {
      setAuthStatus(`Firebase user пустой. ${authOriginHint()}`);
      toast("Firebase user пустой. Google вход не завершился в этом браузере.");
      return;
    }
    await applyFirebaseGoogleUser(firebaseUser);
  } catch (error) {
    console.error(error);
    setAuthStatus(firebaseAuthErrorMessage(error));
    toast(firebaseAuthErrorMessage(error));
  }
}

async function applyFirebaseGoogleUser(firebaseUser) {
  const pending = JSON.parse(
    localStorage.getItem("sudokuPendingGoogleProfile") || "{}",
  );
  localStorage.removeItem("sudokuPendingGoogleProfile");
  const user = profileFromFirebaseUser(firebaseUser, pending);
  setAuthStatus(`Создаем профиль ${user.name}...`);
  saveUser(user);
  updateTopbar();
  toast("Вы вошли через Google.");
  saveFirebaseProfile(user).then(() => {
    setAuthStatus(`Профиль ${user.name} сохранен.`);
  });
  window.setTimeout(() => (location.href = "profile.html"), 700);
}

async function saveFirebaseProfile(user) {
  try {
    const services = await getFirebaseServices();
    const { doc, setDoc, serverTimestamp } = services.firestoreModule;
    await setDoc(
      doc(services.db, "profiles", user.id),
      {
        id: user.id,
        name: user.name,
        city: user.city,
        method: user.method,
        email: user.email,
        avatarId: user.avatarId,
        pro: Boolean(user.pro),
        proSource: user.proSource,
        proTrialUntil: user.proTrialUntil,
        invitedFriends: user.invitedFriends,
        cleanNoHintPuzzles: user.cleanNoHintPuzzles,
        xp: user.xp,
        completedPuzzles: user.completedPuzzles,
        dailyStats: user.dailyStats,
        dailyHintUsage: user.dailyHintUsage,
        dailyAiUsage: user.dailyAiUsage,
        dailyPuzzlePlays: user.dailyPuzzlePlays,
        lastStreakDate: user.lastStreakDate,
        totalSeconds: user.totalSeconds,
        completed: user.completed,
        averageSeconds: user.averageSeconds,
        streak: user.streak,
        accuracy: user.accuracy,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    console.warn("Firebase profile sync skipped:", error.message);
  }
}

async function signInOrCreateEmailUser({ email, password }) {
  const services = await getFirebaseServices();
  try {
    return await services.authModule.signInWithEmailAndPassword(
      services.auth,
      email,
      password,
    );
  } catch (error) {
    if (error?.code !== "auth/user-not-found" && error?.code !== "auth/invalid-credential") {
      throw error;
    }
    return services.authModule.createUserWithEmailAndPassword(
      services.auth,
      email,
      password,
    );
  }
}

async function saveFirebaseResult(result) {
  try {
    const services = await getFirebaseServices();
    const { doc, setDoc, serverTimestamp } = services.firestoreModule;
    const id = `${result.date}_${result.puzzleId}_${result.userId}`.replaceAll(
      "/",
      "_",
    );
    await setDoc(
      doc(services.db, "dailyResults", id),
      {
        ...result,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    console.warn("Firebase result sync skipped:", error.message);
  }
}

async function loadFirebaseResults(date = todayKey()) {
  try {
    const services = await getFirebaseServices();
    const { collection, getDocs, query, where } = services.firestoreModule;
    const snapshot = await Promise.race([
      getDocs(
        query(collection(services.db, "dailyResults"), where("date", "==", date)),
      ),
      new Promise((_, reject) =>
        window.setTimeout(() => reject(new Error("Leaderboard timeout")), 2500),
      ),
    ]);
    return snapshot.docs.map((docItem) => docItem.data());
  } catch (error) {
    console.warn("Firebase leaderboard load skipped:", error.message);
    return [];
  }
}

function localResultsFromAccounts(date = null) {
  const rows = [];
  Object.values(getAccounts()).forEach((account) => {
    Object.entries(account.completedPuzzles || {}).forEach(([puzzleId, stat]) => {
      const completedDate = stat.completedAt?.slice(0, 10);
      if (date && completedDate !== date) return;
      rows.push({
        userId: account.id,
        name: account.name,
        city: account.city,
        avatarId: account.avatarId,
        date,
        puzzleId,
        level: puzzleId.split("-")[0],
        seconds: stat.seconds || account.averageSeconds || 0,
        mistakes: stat.mistakes || 0,
        hints: stat.hints || 0,
        accuracy: stat.accuracy || account.accuracy || 0,
        xp: account.xp || stat.xp || 0,
        score: stat.xp || 0,
        completedAt: stat.completedAt,
      });
    });
  });
  return rows;
}

function profileLeaderboardRows() {
  return Object.values(getAccounts())
    .filter((account) => account.completed > 0 || Object.keys(account.completedPuzzles || {}).length > 0)
    .map((account) => ({
      userId: account.id,
      name: account.name,
      city: account.city,
      avatarId: account.avatarId,
      seconds: account.averageSeconds || account.totalSeconds || 0,
      mistakes: 0,
      accuracy: account.accuracy || 0,
      completed: account.completed || Object.keys(account.completedPuzzles || {}).length,
      xp: account.xp || 0,
    }));
}

function updateTopbar() {
  const user = getUser();
  const initials =
    AVATAR_LABELS[user.avatarId] ||
    user.name.trim().slice(0, 2).toUpperCase() ||
    "U";
  document.querySelectorAll("[data-user-name]").forEach((el) => {
    el.textContent = user.signedIn ? user.name : "Войти";
  });
  document.querySelectorAll("[data-user-initials]").forEach((el) => {
    el.textContent = initials;
    el.className = `avatar ${user.avatarId || ""}`.trim();
  });
  document.querySelectorAll(".profile-button").forEach((el) => {
    el.setAttribute("href", user.signedIn ? "profile.html" : "login.html");
  });
  injectLogoutButton(user);
}

function injectLogoutButton(user = getUser()) {
  let button = document.querySelector("[data-logout]");
  if (!user.signedIn) {
    button?.remove();
    return;
  }
  if (!button) {
    button = document.createElement("button");
    button.className = "logout-button";
    button.type = "button";
    button.dataset.logout = "true";
    button.textContent = "Выйти";
    button.addEventListener("click", logoutUser);
  }
  const actions = topActionsContainer();
  if (actions && button.parentElement !== actions) actions.appendChild(button);
}

async function logoutUser() {
  try {
    const services = await getFirebaseServices();
    await services.authModule.signOut(services.auth);
  } catch (error) {
    console.warn("Firebase sign out skipped:", error.message);
  }
  localStorage.removeItem("sudokuUser");
  localStorage.removeItem("sudokuCurrentAccountId");
  updateTopbar();
  applyTheme("light");
  toast("Вы вышли из аккаунта.");
  if (document.body.dataset.page === "profile") {
    window.setTimeout(() => (location.href = "login.html"), 500);
  }
}

function applyTheme(theme = getUser().theme || "light") {
  document.documentElement.dataset.theme = theme;
  const toggle = document.querySelector("[data-theme-toggle]");
  if (toggle) toggle.textContent = theme === "dark" ? "Light mode" : "Dark mode";
}

function injectThemeToggle() {
  if (document.querySelector("[data-theme-toggle]")) return;
  const actions = topActionsContainer();
  if (!actions) return;
  const button = document.createElement("button");
  button.className = "theme-toggle";
  button.type = "button";
  button.dataset.themeToggle = "true";
  button.addEventListener("click", () => {
    const user = getUser();
    user.theme = user.theme === "dark" ? "light" : "dark";
    saveUser(user);
    applyTheme(user.theme);
  });
  const profile = actions.querySelector(".profile-button");
  actions.insertBefore(button, profile || null);
  applyTheme();
}

function topActionsContainer() {
  const topbar = document.querySelector(".topbar");
  if (!topbar) return null;
  let actions = topbar.querySelector(".top-actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "top-actions";
    topbar.appendChild(actions);
  }
  const profile = topbar.querySelector(".profile-button");
  if (profile && profile.parentElement !== actions) actions.appendChild(profile);
  return actions;
}

function setActiveNav() {
  const file = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav a").forEach((link) => {
    const href = link.getAttribute("href");
    link.classList.toggle(
      "active",
      href === file || (file === "" && href === "index.html"),
    );
  });
}

function toast(message) {
  let el = document.querySelector(".toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("show");
  window.setTimeout(() => el.classList.remove("show"), 2400);
}

function setAuthStatus(message) {
  const el = document.querySelector("[data-auth-status]");
  if (el) el.textContent = message;
  localStorage.setItem("sudokuAuthDebug", message);
}

function authOriginHint() {
  return `Текущий адрес: ${location.origin}. В Firebase Authorized domains должен быть ${location.hostname}.`;
}

function isFileMode() {
  return location.protocol === "file:";
}

function redirectFileModeToLocalServer() {
  if (!isFileMode()) return false;
  const page = location.pathname.split("/").pop() || "index.html";
  location.href = `http://127.0.0.1:5500/${page}`;
  return true;
}

function formatTime(total) {
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cellName(index) {
  return `R${Math.floor(index / 9) + 1}C${(index % 9) + 1}`;
}

function cellPeersText(index) {
  const row = Math.floor(index / 9) + 1;
  const col = (index % 9) + 1;
  const boxRow = Math.floor((row - 1) / 3) + 1;
  const boxCol = Math.floor((col - 1) / 3) + 1;
  return `строка ${row}, колонка ${col}, блок ${boxRow}-${boxCol}`;
}

function coachExplanation(index, value) {
  return `${cellName(index)} подходит цифра ${value}: в этой строке, колонке и квадрате 3x3 такой цифры еще нет, поэтому ход не создает конфликт. Лучший подход сейчас - сначала закрывать клетки с одним понятным кандидатом, а не угадывать.`;
}

function coachWeaknessSummary() {
  const hints = state.hintLog.length;
  const mistakes = state.mistakeLog.length;
  if (!hints && !mistakes) {
    return "Вы решили уровень чисто: без подсказок и ошибок. Следующая цель - сохранить темп и попробовать более сложный режим.";
  }
  const parts = [];
  if (hints) parts.push(`Вы использовали подсказки: ${hints}. Чаще всего это значит, что стоит тренировать поиск одиночных кандидатов.`);
  if (mistakes) parts.push(`Ошибок: ${mistakes}. Перед вводом проверяйте строку, колонку и блок 3x3.`);
  parts.push("Рекомендованная стратегия: сначала сканировать блоки 3x3, затем строки с 5+ заполненными клетками, и только потом использовать заметки.");
  return parts.join(" ");
}

function secondsFromTime(value) {
  const [m, s] = value.split(":").map(Number);
  return m * 60 + s;
}

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateKeyFromOffset(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function updateDailyStreak(user, dayKey = todayKey()) {
  if (user.lastStreakDate === dayKey) return user.streak || 1;
  user.streak = user.lastStreakDate === dateKeyFromOffset(-1) ? (user.streak || 0) + 1 : 1;
  user.lastStreakDate = dayKey;
  return user.streak;
}

function monthDays() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const total = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: Math.min(30, total) }, (_, index) => {
    const day = index + 1;
    return {
      day,
      key: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    };
  });
}

function loadPuzzle(puzzle) {
  state.puzzleKey = puzzle.level;
  state.currentPuzzle = puzzle;
  state.board = puzzle.puzzle.split("").map((value, index) => ({
    value: value === "0" ? "" : value,
    solution: puzzle.solution[index],
    given: value !== "0",
    error: false,
  }));
  state.notes = {};
  state.selected = null;
  state.seconds = 0;
  state.mistakes = 0;
  state.hintLog = [];
  state.mistakeLog = [];
}

function currentPuzzleForPage() {
  const params = new URLSearchParams(location.search);
  const level = params.get("level");
  const task = Number(params.get("task"));
  if (level && PUZZLES[level]) {
    const taskIndex =
      Number.isInteger(task) && task >= 1 && task <= 50 ? task - 1 : 0;
    return PUZZLES[level][taskIndex];
  }
  if (document.body.dataset.page === "daily") return dailyPuzzle();
  return PUZZLES.medium[0];
}

function dailyPuzzle() {
  const date = todayKey();
  return createPuzzle("medium", 0, `daily:${date}`);
}

function renderBoard() {
  const board = document.querySelector("[data-sudoku-board]");
  if (!board) return;
  board.innerHTML = "";
  state.board.forEach((cell, index) => {
    const button = document.createElement("button");
    button.className = "sudoku-cell";
    button.type = "button";
    button.dataset.index = index;
    if (cell.given) button.classList.add("given");
    if (cell.error) button.classList.add("error");
    if (state.selected === index) button.classList.add("selected");
    if (state.selected !== null && isRelated(index, state.selected))
      button.classList.add("related");
    if (cell.value === cell.solution && !cell.given)
      button.classList.add("complete");
    if (cell.value) {
      button.textContent = cell.value;
    } else if (state.notes[index]) {
      const notes = document.createElement("span");
      notes.className = "notes";
      for (let n = 1; n <= 9; n += 1) {
        const part = document.createElement("span");
        part.textContent = state.notes[index].includes(String(n)) ? n : "";
        notes.appendChild(part);
      }
      button.appendChild(notes);
    }
    button.addEventListener("click", () => {
      state.selected = index;
      renderBoard();
    });
    board.appendChild(button);
  });
}

function isRelated(a, b) {
  if (a === b) return false;
  const ar = Math.floor(a / 9);
  const br = Math.floor(b / 9);
  const ac = a % 9;
  const bc = b % 9;
  const ab = Math.floor(ar / 3) * 3 + Math.floor(ac / 3);
  const bb = Math.floor(br / 3) * 3 + Math.floor(bc / 3);
  return ar === br || ac === bc || ab === bb;
}

function placeNumber(number) {
  if (state.selected === null) {
    toast("Выберите клетку на поле.");
    return;
  }
  const cell = state.board[state.selected];
  if (cell.given) {
    toast("Стартовые цифры нельзя менять.");
    return;
  }
  if (state.noteMode) {
    const existing = state.notes[state.selected] || [];
    state.notes[state.selected] = existing.includes(number)
      ? existing.filter((item) => item !== number)
      : [...existing, number].sort();
    renderBoard();
    return;
  }
  cell.value = number;
  cell.error = number !== cell.solution;
  if (cell.error) {
    state.mistakes += 1;
    state.mistakeLog.push({
      cell: state.selected,
      tried: number,
      correct: cell.solution,
      at: state.seconds,
      reason: `${cellName(state.selected)}: ${number} конфликтует с ${cellPeersText(state.selected)}. Правильная цифра здесь ${cell.solution}.`,
    });
    coach();
  }
  delete state.notes[state.selected];
  updateGameStats();
  renderBoard();
  if (isSolved()) completeGame();
}

function eraseCell() {
  if (state.selected === null) return;
  const cell = state.board[state.selected];
  if (cell.given) return;
  cell.value = "";
  cell.error = false;
  delete state.notes[state.selected];
  renderBoard();
}

function hint() {
  const user = getUser();
  const dayKey = todayKey();
  const usedToday = user.dailyHintUsage?.[dayKey] || 0;
  if (!isProUser(user) && usedToday >= FREE_DAILY_HINT_LIMIT) {
    toast(`Бесплатная версия дает ${FREE_DAILY_HINT_LIMIT} подсказки в день. Pro открывает безлимитные AI-подсказки.`);
    window.setTimeout(() => (location.href = "pro.html"), 900);
    return;
  }
  const index = state.board.findIndex(
    (cell) => !cell.given && cell.value !== cell.solution,
  );
  if (index === -1) return;
  const value = state.board[index].solution;
  state.selected = index;
  user.dailyHintUsage = user.dailyHintUsage || {};
  user.dailyHintUsage[dayKey] = usedToday + 1;
  saveUser(user);
  updateGameStats();
  state.hintLog.push({
    cell: index,
    value,
    at: state.seconds,
    explanation: coachExplanation(index, value),
  });
  state.board[index].value = value;
  state.board[index].error = false;
  delete state.notes[index];
  renderBoard();
  if (isSolved()) completeGame();
  showCoachMessage(coachExplanation(index, value));
}

function coach() {
  const index =
    state.selected ??
    state.board.findIndex((cell) => !cell.given && !cell.value);
  if (index === -1) {
    showCoachMessage("Поле почти готово. Проверьте ошибки и завершайте challenge.");
    return;
  }
  const cell = state.board[index];
  state.selected = index;
  showCoachMessage(coachExplanation(index, cell.solution));
  renderBoard();
}

function nextCoachCellIndex() {
  if (state.selected !== null) {
    const selected = state.board[state.selected];
    if (selected && !selected.given && selected.value !== selected.solution) {
      return state.selected;
    }
  }
  return state.board.findIndex((cell) => !cell.given && cell.value !== cell.solution);
}

function coachCandidateText(index) {
  const row = Math.floor(index / 9);
  const col = index % 9;
  const rowValues = new Set();
  const colValues = new Set();
  const boxValues = new Set();
  for (let i = 0; i < 9; i += 1) {
    const rowValue = state.board[row * 9 + i].value;
    const colValue = state.board[i * 9 + col].value;
    if (rowValue) rowValues.add(String(rowValue));
    if (colValue) colValues.add(String(colValue));
  }
  const boxRow = Math.floor(row / 3) * 3;
  const boxCol = Math.floor(col / 3) * 3;
  for (let r = boxRow; r < boxRow + 3; r += 1) {
    for (let c = boxCol; c < boxCol + 3; c += 1) {
      const value = state.board[r * 9 + c].value;
      if (value) boxValues.add(String(value));
    }
  }
  const candidates = [];
  for (let n = 1; n <= 9; n += 1) {
    const value = String(n);
    if (!rowValues.has(value) && !colValues.has(value) && !boxValues.has(value)) {
      candidates.push(value);
    }
  }
  return candidates.join(", ") || "нет безопасных кандидатов";
}

function coachSmallHint() {
  const index = nextCoachCellIndex();
  if (index === -1) {
    showCoachMessage("Все клетки уже выглядят решенными. Проверьте ошибки и завершайте уровень.");
    return;
  }
  state.selected = index;
  showCoachMessage(
    `Маленький намек: посмотрите на ${cellName(index)}. Безопасные кандидаты сейчас: ${coachCandidateText(index)}. Начните с проверки строки, потом колонки, затем блока 3x3.`,
  );
  renderBoard();
}

function coachExplainLogic() {
  const index = nextCoachCellIndex();
  if (index === -1) {
    showCoachMessage("Ходов для разбора не осталось. Если поле не завершилось, где-то есть ошибка.");
    return;
  }
  const value = state.board[index].solution;
  state.selected = index;
  state.hintLog.push({
    cell: index,
    value,
    at: state.seconds,
    mode: "logic",
    explanation: coachExplanation(index, value),
  });
  showCoachMessage(
    `${coachExplanation(index, value)} Почему этот подход лучший: он не угадывает ответ, а сначала отсекает невозможные цифры через строку, колонку и блок. Так вы быстрее находите одиночных кандидатов и меньше ошибаетесь.`,
  );
  renderBoard();
}

function coachNextMove() {
  hint();
}

function showCoachMessage(message) {
  const box = document.querySelector("[data-coach]");
  if (!box) return;
  box.textContent = message;
}

async function requestAiCoach(context) {
  const endpoints =
    location.protocol.startsWith("http") && location.hostname !== "127.0.0.1"
      ? [AI_DEPLOYED_ENDPOINT, AI_COACH_ENDPOINT]
      : [AI_COACH_ENDPOINT, AI_DEPLOYED_ENDPOINT];
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      return await requestAiEndpoint(endpoint, context);
    } catch (error) {
      lastError = error;
    }
  }
  try {
    return await requestGroqDirect(context);
  } catch (error) {
    throw error || lastError || new Error("AI unavailable");
  }
}

async function requestAiEndpoint(endpoint, context) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 28000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(context),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "AI proxy unavailable");
    }
    return data.answer || "AI не вернул текст.";
  } finally {
    window.clearTimeout(timeout);
  }
}

async function requestGroqDirect(context) {
  const prompt = [
    "You are Morning Sudoku Arena AI Coach.",
    "Answer any user question clearly and helpfully.",
    "If the question is about Sudoku, teach the logic step by step and avoid dumping the full solution unless asked.",
    "Prefer Russian when the user writes Russian.",
    "Be concise, practical, and friendly.",
    "",
    `User question: ${context.question || "Give a useful recommendation."}`,
    "App/player context:",
    JSON.stringify(context, null, 2).slice(0, 5000),
  ].join("\n");
  const response = await fetch(GROQ_DIRECT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_DIRECT_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_DIRECT_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.65,
      max_tokens: 800,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Groq error ${response.status}`);
  }
  return data.choices?.[0]?.message?.content || "AI не вернул текст.";
}

function openAiCoachWindow() {
  const existing = document.querySelector("[data-ai-window]");
  existing?.remove();
  const user = getUser();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.dataset.aiWindow = "true";
  modal.innerHTML = `
    <section class="win-modal ai-window" role="dialog" aria-modal="true" aria-label="AI Coach">
      <p class="eyebrow">AI Coach</p>
      <h2>Разбор стратегии</h2>
      <div class="coach-box" data-ai-answer>${escapeHtml(user.aiReviewLog?.[0]?.summary || "Спросите AI Coach о текущем уровне, ошибках или стратегии.")}</div>
      <div class="field">
        <label for="ai-question">Ваш вопрос</label>
        <input id="ai-question" data-ai-question type="text" placeholder="Например: почему я ошибаюсь в блоках 3x3?">
      </div>
      <div class="actions">
        <button class="button accent" type="button" data-ai-ask>Спросить AI</button>
        <button class="button secondary" type="button" data-ai-close>Закрыть</button>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
  modal.querySelector("[data-ai-close]").addEventListener("click", () => modal.remove());
  modal.querySelector("[data-ai-ask]").addEventListener("click", () => askAiCoach(modal));
}

async function askAiCoach(modal) {
  const answer = modal.querySelector("[data-ai-answer]");
  const question = modal.querySelector("[data-ai-question]").value.trim();
  const user = getUser();
  const context = {
    question,
    currentPuzzle: state.currentPuzzle?.title || "unknown",
    hints: state.hintLog,
    mistakes: state.mistakeLog,
    profileReview: user.aiReviewLog?.[0]?.summary || "",
  };
  if (!question) {
    answer.textContent = "Напишите вопрос, и я разберу его через вашу историю ошибок и подсказок.";
    return;
  }
  answer.textContent = "AI думает...";
  try {
    answer.textContent = await requestAiCoach(context);
  } catch (error) {
    answer.textContent = `${coachWeaknessSummary()} Локальный AI proxy не запущен, поэтому сейчас работает встроенный Coach.`;
  }
}

function isSolved() {
  return state.board.every((cell) => cell.value === cell.solution);
}

async function completeGame() {
  window.clearInterval(state.timerId);
  const user = getUser();
  const playedSeconds = state.seconds;
  const solvedAccuracy = Math.max(0, Math.round(100 - state.mistakes * 5));
  const puzzleKey = puzzleProgressKey();
  const wasCompleted = isPuzzleCompleted(user, state.currentPuzzle);
  let earnedTrial = false;
  const xpEarned = calculateScore({
    seconds: playedSeconds,
    mistakes: state.mistakes,
    hints: state.hintLog.length,
    accuracy: solvedAccuracy,
    level: state.currentPuzzle.level,
  });
  const dayKey = todayKey();
  const previousDay = user.dailyStats[dayKey] || {
    games: 0,
    completed: 0,
    seconds: 0,
    bestSeconds: 0,
    mistakes: 0,
    accuracyTotal: 0,
  };
  user.completed += 1;
  if (puzzleKey && !wasCompleted) {
    user.completedPuzzles[puzzleKey] = {
      completedAt: new Date().toISOString(),
      seconds: playedSeconds,
      accuracy: solvedAccuracy,
      mistakes: state.mistakes,
      hints: state.hintLog.length,
      xp: xpEarned,
    };
  }
  user.aiReviewLog.unshift({
    puzzleId: state.currentPuzzle.id,
    title: state.currentPuzzle.title,
    date: new Date().toISOString(),
    hints: state.hintLog,
    mistakes: state.mistakeLog,
    summary: coachWeaknessSummary(),
  });
  user.aiReviewLog = user.aiReviewLog.slice(0, 20);
  user.totalSeconds += playedSeconds;
  user.averageSeconds = Math.round(user.totalSeconds / user.completed);
  updateDailyStreak(user, dayKey);
  user.accuracy = Math.round(
    (user.accuracy * (user.completed - 1) + solvedAccuracy) / user.completed,
  );
  user.leaderboardRank = calculateRank(
    user.averageSeconds,
    user.accuracy,
    user.completed,
  );
  user.xp += wasCompleted ? Math.round(xpEarned / 4) : xpEarned;
  user.dailyStats[dayKey] = {
    games: previousDay.games + 1,
    completed: previousDay.completed + 1,
    seconds: previousDay.seconds + playedSeconds,
    bestSeconds: previousDay.bestSeconds
      ? Math.min(previousDay.bestSeconds, playedSeconds)
      : playedSeconds,
    mistakes: previousDay.mistakes + state.mistakes,
    accuracyTotal: previousDay.accuracyTotal + solvedAccuracy,
  };
  if (state.currentPuzzle.id.startsWith("daily:")) {
    user.dailyPuzzlePlays = user.dailyPuzzlePlays || {};
    user.dailyPuzzlePlays[dayKey] = (user.dailyPuzzlePlays[dayKey] || 0) + 1;
  }
  if (!state.hintLog.length && puzzleKey && !wasCompleted) {
    user.cleanNoHintPuzzles = user.cleanNoHintPuzzles || {};
    user.cleanNoHintPuzzles[puzzleKey] = {
      completedAt: new Date().toISOString(),
      seconds: playedSeconds,
      level: state.currentPuzzle.level,
    };
    if (!isProUser(user) && cleanSolveCount(user) >= CLEAN_SOLVES_FOR_TRIAL) {
      user.proTrialUntil = trialEndDate(PRO_TRIAL_DAYS);
      user.proSource = "clean-trial";
      earnedTrial = true;
      toast(`Вы решили ${CLEAN_SOLVES_FOR_TRIAL} уровней без подсказок. Pro trial открыт на ${PRO_TRIAL_DAYS} дней.`);
    }
  }
  saveUser(user);
  const result = {
    userId: user.id,
    name: user.name,
    city: user.city,
    avatarId: user.avatarId,
    date: dayKey,
    puzzleId: state.currentPuzzle.id,
    level: state.currentPuzzle.level,
    seconds: playedSeconds,
    mistakes: state.mistakes,
    hints: state.hintLog.length,
    accuracy: solvedAccuracy,
    xp: user.xp,
    score: wasCompleted ? Math.round(xpEarned / 4) : xpEarned,
    completedAt: new Date().toISOString(),
  };
  saveLocalResult(result);
  saveFirebaseProfile(user);
  saveFirebaseResult(result);
  updateTopbar();
  showWinModal({ user, solvedAccuracy, xpEarned, wasCompleted, earnedTrial });
}

function calculateRank(averageSeconds, accuracy, completed) {
  if (!completed) return 0;
  const penalty = accuracy < 95 ? 2 : 0;
  return Math.max(1, 1 + penalty);
}

function calculateScore({ seconds, mistakes, hints, accuracy, level }) {
  const levelMultiplier = { easy: 1, medium: 1.35, hard: 1.8, expert: 2.25, master: 2.8 }[level] || 1;
  const base = 220 * levelMultiplier;
  const speedBonus = Math.max(0, 160 - seconds * 0.45);
  const accuracyBonus = accuracy * 1.15;
  const hintPenalty = hints * 35;
  const mistakePenalty = mistakes * 28;
  return Math.max(10, Math.round(base + speedBonus + accuracyBonus - hintPenalty - mistakePenalty));
}

function showWinModal({ user, solvedAccuracy, xpEarned, wasCompleted, earnedTrial = false }) {
  const existing = document.querySelector("[data-win-modal]");
  existing?.remove();
  const nextUrl = nextPuzzleUrl();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.dataset.winModal = "true";
  modal.innerHTML = `
    <section class="win-modal" role="dialog" aria-modal="true" aria-label="Уровень пройден">
      <p class="eyebrow">Уровень пройден</p>
      <h2>${earnedTrial ? "Вы заработали Pro Trial!" : "Отличная работа!"}</h2>
      <p class="lead">Вы закрыли ${state.currentPuzzle.title} за ${formatTime(state.seconds)} с точностью ${solvedAccuracy}%.</p>
      <div class="reward-grid">
        <div><span>XP</span><strong>+${wasCompleted ? Math.round(xpEarned / 4) : xpEarned}</strong></div>
        <div><span>Focus Rank</span><strong>${focusRank(user.xp)}</strong></div>
        <div><span>Streak</span><strong>${user.streak}</strong></div>
      </div>
      <div class="coach-review">
        <h3>AI-разбор</h3>
        <p>${escapeHtml(coachWeaknessSummary())}</p>
      </div>
      ${
        earnedTrial
          ? `<div class="trial-earned">
              <p class="eyebrow">Награда за чистую игру</p>
              <h3>${PRO_TRIAL_DAYS} дней Pro открыты</h3>
              <p>Вы решили ${CLEAN_SOLVES_FOR_TRIAL} уровней без подсказок. Теперь доступны Expert, Master, безлимитный AI Coach, Pro-аватарки и персональный план тренировок.</p>
              <a class="button accent" href="pro.html">Посмотреть Pro</a>
            </div>`
          : ""
      }
      ${
        isProUser(user)
          ? ""
          : `<div class="pro-nudge">
              <strong>Хочешь узнать, где ты потерял время?</strong>
              <span>Pro откроет глубокий AI-разбор, план тренировок и безлимитные подсказки.</span>
              <a class="button secondary" href="pro.html">Начать AI-тренировку</a>
            </div>`
      }
      <div class="actions">
        <a class="button accent" href="${nextUrl}">Следующий уровень</a>
        <a class="button secondary" href="${state.currentPuzzle.level}.html">К уровням</a>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
}

function updateGameStats() {
  const timer = document.querySelector("[data-timer]");
  const mistakes = document.querySelector("[data-mistakes]");
  const level = document.querySelector("[data-level]");
  const streak = document.querySelector("[data-streak-count]");
  const hintsLeft = document.querySelector("[data-hints-left]");
  const user = getUser();
  if (timer) timer.textContent = formatTime(state.seconds);
  if (mistakes) mistakes.textContent = state.mistakes;
  if (level)
    level.textContent =
      state.currentPuzzle?.title || DIFFICULTIES[state.puzzleKey].title;
  if (streak) streak.textContent = `${user.streak || 0} дней`;
  if (hintsLeft) {
    const used = user.dailyHintUsage?.[todayKey()] || 0;
    hintsLeft.textContent = isProUser(user) ? "∞" : `${Math.max(0, FREE_DAILY_HINT_LIMIT - used)}/${FREE_DAILY_HINT_LIMIT}`;
  }
}

function startTimer() {
  window.clearInterval(state.timerId);
  state.timerId = window.setInterval(() => {
    state.seconds += 1;
    updateGameStats();
  }, 1000);
}

function resetPuzzle() {
  if (!state.currentPuzzle) return;
  loadPuzzle(state.currentPuzzle);
  renderBoard();
  updateGameStats();
  startTimer();
  showCoachMessage("Уровень начат заново. Hints и ошибки для этой попытки очищены.");
}

function initGame() {
  if (!document.querySelector("[data-sudoku-board]")) return;
  loadPuzzle(currentPuzzleForPage());
  const user = getUser();
  const isDaily = state.currentPuzzle?.id?.startsWith("daily:");
  const dailyPlays = user.dailyPuzzlePlays?.[todayKey()] || 0;
  if (isDaily && !isProUser(user) && dailyPlays >= FREE_DAILY_PUZZLE_LIMIT) {
    showDailyLimitOverlay();
  }
  document.querySelectorAll("[data-number]").forEach((button) => {
    button.addEventListener("click", () => placeNumber(button.dataset.number));
  });
  document.querySelector("[data-erase]")?.addEventListener("click", eraseCell);
  document.querySelector("[data-hint]")?.addEventListener("click", hint);
  document.querySelector("[data-reset]")?.addEventListener("click", resetPuzzle);
  document.querySelector("[data-coach-small]")?.addEventListener("click", coachSmallHint);
  document.querySelector("[data-coach-logic]")?.addEventListener("click", coachExplainLogic);
  document.querySelector("[data-coach-next]")?.addEventListener("click", coachNextMove);
  document.querySelector("[data-note]")?.addEventListener("click", (event) => {
    state.noteMode = !state.noteMode;
    event.currentTarget.classList.toggle("active", state.noteMode);
  });
  document.addEventListener("keydown", (event) => {
    if (/^[1-9]$/.test(event.key)) placeNumber(event.key);
    if (event.key === "Backspace" || event.key === "Delete") eraseCell();
  });
  renderBoard();
  updateGameStats();
  startTimer();
}

function showDailyLimitOverlay() {
  const existing = document.querySelector("[data-daily-limit]");
  existing?.remove();
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.dataset.dailyLimit = "true";
  modal.innerHTML = `
    <section class="win-modal" role="dialog" aria-modal="true" aria-label="Daily лимит">
      <p class="eyebrow">Бесплатный лимит</p>
      <h2>Daily Challenge на сегодня уже сыгран</h2>
      <p class="lead">В бесплатной версии доступен ${FREE_DAILY_PUZZLE_LIMIT} Daily Challenge в день. Pro открывает безлимитные puzzles, AI Coach и продвинутую статистику.</p>
      <div class="actions">
        <a class="button accent" href="pro.html">Начать AI-тренировку</a>
        <a class="button secondary" href="difficulties.html">Открыть уровни</a>
      </div>
    </section>
  `;
  document.body.appendChild(modal);
}

function renderVisualBoard() {
  const board = document.querySelector("[data-visual-board]");
  if (!board) return;
  const puzzle = PUZZLES.medium[0].puzzle;
  board.innerHTML = "";
  puzzle.split("").forEach((value) => {
    const cell = document.createElement("div");
    cell.textContent = value === "0" ? "" : value;
    board.appendChild(cell);
  });
}

function renderDifficulties() {
  const root = document.querySelector("[data-difficulties]");
  if (!root) return;
  const user = getUser();
  root.innerHTML = Object.entries(DIFFICULTIES)
    .map(
      ([key, meta]) => {
        const completed = PUZZLES[key].filter((puzzle) =>
          isPuzzleCompleted(user, puzzle),
        ).length;
        const locked = meta.pro && !isProUser(user);
        return `
    <article class="card difficulty-card ${locked ? "locked" : ""}">
      <div>
        <h3>${meta.title}${meta.pro ? " · Pro" : ""}</h3>
        <p>${meta.description}</p>
      </div>
      <div class="difficulty-meta">
        <span class="tag">50 уникальных заданий</span>
        <span class="tag">${meta.target}</span>
        <span class="tag">${completed}/50 пройдено</span>
        ${meta.pro ? `<span class="tag">Pro</span>` : ""}
      </div>
      <div class="progress"><span style="width: ${(completed / 50) * 100}%"></span></div>
      <a class="button" href="${locked ? "pro.html" : `${key}.html`}">${locked ? "Открыть Pro" : "Открыть уровни"}</a>
    </article>
  `;
      },
    )
    .join("");
}

function renderDifficultyLevelPage() {
  const root = document.querySelector("[data-level-list]");
  if (!root) return;
  const level = document.body.dataset.level;
  const meta = DIFFICULTIES[level];
  const user = getUser();
  if (meta?.pro && !isProUser(user)) {
    root.innerHTML = `
      <article class="card pro-lock-card">
        <h3>${meta.title} доступен в Pro</h3>
        <p>Активируйте Pro, чтобы открыть 50 уникальных заданий этого режима.</p>
        <a class="button accent" href="pro.html">Открыть Pro</a>
      </article>
    `;
    return;
  }
  const completed = PUZZLES[level].filter((puzzle) =>
    isPuzzleCompleted(user, puzzle),
  ).length;
  const nextPuzzle =
    PUZZLES[level].find((puzzle) => !isPuzzleCompleted(user, puzzle)) ||
    PUZZLES[level][0];
  document.querySelectorAll("[data-level-title]").forEach((el) => {
    el.textContent = meta.title;
  });
  document.querySelectorAll("[data-level-summary]").forEach((el) => {
    el.textContent = `${completed}/50 уровней пройдено · ${focusRank(user.xp)} · ${user.xp} XP`;
  });
  root.innerHTML = PUZZLES[level]
    .map((puzzle) => {
      const done = isPuzzleCompleted(user, puzzle);
      return `
        <a class="level-tile ${done ? "done" : ""}" href="daily.html?level=${level}&task=${puzzle.index}" aria-label="${meta.title} уровень ${puzzle.index}">
          <strong>${puzzle.index}</strong>
          <span>${done ? "Пройден" : "Новый"}</span>
        </a>
      `;
    })
    .join("");
}

async function renderLeaderboard() {
  const arenaRoot = document.querySelector("[data-leaderboard]");
  const dailyRoot = document.querySelector("[data-daily-leaderboard]");
  if (!arenaRoot && !dailyRoot) return;
  if (arenaRoot) arenaRoot.innerHTML = `<p style="color: var(--muted);">Загружаем рейтинг...</p>`;
  if (dailyRoot) dailyRoot.innerHTML = `<p style="color: var(--muted);">Загружаем Daily...</p>`;
  const date = todayKey();
  const dateLabel = document.querySelector("[data-daily-date]");
  if (dateLabel) dateLabel.textContent = new Date().toLocaleDateString("ru-RU");
  bindLeaderboardCityFilter();
  const city = selectedLeaderboardCity();
  const firebaseResults = await loadFirebaseResults(date);
  const localResults = getLocalResults();
  const accountResults = localResultsFromAccounts();
  const profileRows = profileLeaderboardRows();

  if (dailyRoot) {
    const dailyRows = bestDailyRows(
      [...firebaseResults, ...localResults].filter(
        (result) =>
          result.date === date &&
          String(result.puzzleId || "").startsWith("daily:") &&
          cityMatches(result, city),
      ),
    );
    dailyRoot.innerHTML = dailyRows.length
      ? dailyRows
          .map(
            (player, index) => `
        <div class="leader-row">
          <span class="rank">${index + 1}</span>
          <div>
            <strong>${escapeHtml(player.name || "Игрок")}</strong>
            <div style="color: var(--muted); font-size: 13px;">${escapeHtml(player.city || "Город не указан")}</div>
          </div>
          <strong>${formatTime(player.seconds || 0)}</strong>
          <strong class="accuracy">${player.accuracy || 0}%</strong>
        </div>
      `,
          )
          .join("")
      : `<p style="color: var(--muted);">Сегодня в Daily пока нет результатов${city === "all" ? "" : ` из города ${escapeHtml(city)}`}. Завершите Daily Challenge первым.</p>`;
  }

  if (!arenaRoot) return;
  const byUser = new Map();
  [...firebaseResults, ...localResults, ...accountResults, ...profileRows]
    .filter((result) => cityMatches(result, city))
    .forEach((result) => {
    const previous = byUser.get(result.userId);
    if (
      !previous ||
      (result.xp || 0) > (previous.xp || 0) ||
      result.seconds < previous.seconds ||
      (result.seconds === previous.seconds &&
        result.accuracy > previous.accuracy)
    ) {
      byUser.set(result.userId, result);
    }
  });
  const cityLabel = document.querySelector("[data-city-label]");
  if (cityLabel) cityLabel.textContent = city === "all" ? "Все города" : `Топ игроков из ${city}`;
  const rows = [...byUser.values()].sort((a, b) => {
    if ((b.xp || 0) !== (a.xp || 0)) return (b.xp || 0) - (a.xp || 0);
    if ((b.completed || 0) !== (a.completed || 0)) return (b.completed || 0) - (a.completed || 0);
    if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
    if (a.seconds !== b.seconds) return a.seconds - b.seconds;
    return a.mistakes - b.mistakes;
  });
  if (!rows.length) {
    const user = getUser();
    arenaRoot.innerHTML = user.signedIn
      ? `<p style="color: var(--muted);">Вы вошли как ${escapeHtml(user.name)}. Завершите первый уровень, чтобы попасть в рейтинг${city === "all" ? "" : ` города ${escapeHtml(city)}`}.</p>`
      : `<p style="color: var(--muted);">Войдите и завершите первый уровень, чтобы попасть в рейтинг.</p>`;
    return;
  }
  arenaRoot.innerHTML = rows
    .map(
      (player, index) => `
    <div class="leader-row">
      <span class="rank">${index + 1}</span>
      <div>
        <strong>${escapeHtml(player.name)}</strong>
        <div style="color: var(--muted); font-size: 13px;">${escapeHtml(player.city)}</div>
      </div>
      <strong>${formatTime(player.seconds)}</strong>
      <strong class="accuracy">${player.xp || 0}</strong>
    </div>
  `,
    )
    .join("");
}

function selectedLeaderboardCity() {
  const select = document.querySelector("[data-city-filter]");
  const stored = localStorage.getItem("sudokuLeaderboardCity");
  if (select) {
    const value = stored || select.value || "all";
    select.value = [...select.options].some((option) => option.value === value) ? value : "all";
    return select.value;
  }
  return stored || "all";
}

function bindLeaderboardCityFilter() {
  const select = document.querySelector("[data-city-filter]");
  if (!select || select.dataset.bound === "true") return;
  const user = getUser();
  const stored = localStorage.getItem("sudokuLeaderboardCity");
  if (!stored && user.city) select.value = user.city;
  if (stored) select.value = stored;
  select.dataset.bound = "true";
  select.addEventListener("change", () => {
    localStorage.setItem("sudokuLeaderboardCity", select.value);
    renderLeaderboard();
  });
}

function cityMatches(result, city) {
  return city === "all" || (result.city || "") === city;
}

function bestDailyRows(results) {
  const byUser = new Map();
  results.forEach((result) => {
    if (!result.userId) return;
    const previous = byUser.get(result.userId);
    if (
      !previous ||
      (result.accuracy || 0) > (previous.accuracy || 0) ||
      ((result.accuracy || 0) === (previous.accuracy || 0) &&
        (result.hints || 0) < (previous.hints || 0)) ||
      ((result.accuracy || 0) === (previous.accuracy || 0) &&
        (result.hints || 0) === (previous.hints || 0) &&
        (result.seconds || 0) < (previous.seconds || 0))
    ) {
      byUser.set(result.userId, result);
    }
  });
  return [...byUser.values()].sort((a, b) => {
    if ((b.accuracy || 0) !== (a.accuracy || 0)) return (b.accuracy || 0) - (a.accuracy || 0);
    if ((a.hints || 0) !== (b.hints || 0)) return (a.hints || 0) - (b.hints || 0);
    if ((a.seconds || 0) !== (b.seconds || 0)) return (a.seconds || 0) - (b.seconds || 0);
    return (b.score || 0) - (a.score || 0);
  });
}

function renderProfile() {
  const root = document.querySelector("[data-profile]");
  if (!root) return;
  const user = getUser();
  const selectedDay = root.dataset.selectedDay || todayKey();
  const calendar = monthDays()
    .map(({ day, key }) => {
      const stat = user.dailyStats[key];
      const averageAccuracy = stat
        ? Math.round(stat.accuracyTotal / stat.games)
        : 0;
      return `
      <button class="calendar-day ${stat ? "played" : ""} ${key === selectedDay ? "active" : ""}" type="button" data-day="${key}">
        <strong>${day}</strong>
        <span>${stat ? `${stat.completed} игр · ${averageAccuracy}%` : "0 игр"}</span>
      </button>
    `;
    })
    .join("");
  const dayStat = user.dailyStats[selectedDay];
  const dayDetail = dayStat
    ? `
    <div class="day-detail" data-day-detail>
      <strong>${selectedDay}</strong>
      <div class="metric"><span>Игр за день</span><strong>${dayStat.completed}</strong></div>
      <div class="metric"><span>Время за день</span><strong>${formatTime(dayStat.seconds)}</strong></div>
      <div class="metric"><span>Лучшая скорость</span><strong>${formatTime(dayStat.bestSeconds)}</strong></div>
      <div class="metric"><span>Средняя точность</span><strong>${Math.round(dayStat.accuracyTotal / dayStat.games)}%</strong></div>
    </div>
  `
    : `
    <div class="day-detail" data-day-detail>
      <strong>${selectedDay}</strong>
      <p style="margin: 8px 0 0; color: var(--muted);">В этот день пока нет сыгранных Sudoku.</p>
    </div>
  `;
  root.innerHTML = `
    <section class="card">
      <div class="profile-identity">
        <span class="avatar ${user.avatarId || ""}">${AVATAR_LABELS[user.avatarId] || "MS"}</span>
        <div>
          <h3>${escapeHtml(user.name)}</h3>
          <p>${escapeHtml(user.city)} · ${AUTH_METHOD_LABELS[user.method] || "Гость"}</p>
        </div>
      </div>
      <div class="metric"><span>Время в игре</span><strong>${formatTime(user.totalSeconds)}</strong></div>
      <div class="metric"><span>Пройдено уровней</span><strong>${user.completed}</strong></div>
      <div class="metric"><span>Место в Leaderboard</span><strong>${user.leaderboardRank ? `#${user.leaderboardRank}` : "0"}</strong></div>
    </section>
    <section class="card">
      <h3>Скорость и Streak</h3>
      <div class="metric"><span>Средняя скорость</span><strong>${formatTime(user.averageSeconds)}</strong></div>
      <div class="metric"><span>Streak</span><strong>${user.streak}</strong></div>
      <div class="metric"><span>Точность</span><strong>${user.accuracy}%</strong></div>
    </section>
    <section class="card" style="grid-column: 1 / -1;" data-earn-pro>
      ${earnProMarkup(user)}
    </section>
    ${profileAvatarPickerMarkup(user)}
    <section class="card" style="grid-column: 1 / -1;">
      <h3>Календарь improvement на 30 дней</h3>
      <div class="calendar">${calendar}</div>
      ${dayDetail}
    </section>
    <section class="card" style="grid-column: 1 / -1;">
      <h3>AI Coach: слабые стороны</h3>
      <p>${escapeHtml(user.aiReviewLog?.[0]?.summary || "После первой игры здесь появится персональный разбор подсказок, ошибок и стратегии.")}</p>
    </section>
  `;
  root.querySelectorAll("[data-day]").forEach((button) => {
    button.addEventListener("click", () => {
      root.dataset.selectedDay = button.dataset.day;
      renderProfile();
    });
  });
  root.querySelectorAll("[data-profile-avatar]").forEach((button) => {
    button.addEventListener("click", () => {
      const freshUser = getUser();
      const avatarId = button.dataset.profileAvatar;
      if (button.dataset.lockedAvatar === "true") {
        toast("Эта аватарка доступна в Pro.");
        window.setTimeout(() => (location.href = "pro.html"), 700);
        return;
      }
      freshUser.avatarId = avatarId;
      saveUser(freshUser);
      saveFirebaseProfile(freshUser);
      updateTopbar();
      toast("Аватарка обновлена.");
      renderProfile();
    });
  });
  bindEarnProActions();
}

function renderAiCoachPage() {
  if (document.body.dataset.page !== "ai-coach") return;
  const user = getUser();
  const dayKey = todayKey();
  const aiUsed = user.dailyAiUsage?.[dayKey] || 0;
  const limit = document.querySelector("[data-ai-limit]");
  if (limit) {
    limit.innerHTML = isProUser(user)
      ? `<strong>Pro активен</strong><span>AI-сообщения без дневного лимита</span>`
      : `<strong>${Math.max(0, FREE_DAILY_AI_LIMIT - aiUsed)} / ${FREE_DAILY_AI_LIMIT}</strong><span>бесплатных AI messages осталось сегодня</span><a href="pro.html">Открыть Pro</a>`;
  }
  const advice = document.querySelector("[data-ai-advice]");
  if (advice) {
    const latest = user.aiReviewLog?.[0]?.summary;
    advice.innerHTML = `
      <strong>Последний разбор и советы</strong>
      <span>${escapeHtml(latest || "После завершения уровня здесь появятся слабые стороны, советы и план тренировки.")}</span>
    `;
  }
  document.querySelector("[data-ai-ask-page]")?.addEventListener("click", async () => {
    const answer = document.querySelector("[data-ai-answer]");
    const question = document.querySelector("[data-ai-question]").value.trim();
    if (!question) {
      answer.textContent = "Напишите любой вопрос: про Sudoku, учебу, идеи, маркетинг или стратегию.";
      return;
    }
    const freshUser = getUser();
    const freshUsed = freshUser.dailyAiUsage?.[dayKey] || 0;
    if (!isProUser(freshUser) && freshUsed >= FREE_DAILY_AI_LIMIT) {
      answer.textContent = `Бесплатная версия дает ${FREE_DAILY_AI_LIMIT} AI-сообщения в день. Pro открывает безлимитный AI Coach, персональный план тренировок и глубокий разбор ошибок.`;
      toast("AI лимит на сегодня закончился. Открываем Pro.");
      window.setTimeout(() => (location.href = "pro.html"), 900);
      return;
    }
    answer.textContent = "AI думает...";
    try {
      answer.textContent = await requestAiCoach({
        question,
        profileReview: user.aiReviewLog?.[0]?.summary || "",
        completed: user.completed,
        xp: user.xp,
        streak: user.streak,
        averageSeconds: user.averageSeconds,
        accuracy: user.accuracy,
        latestGame: user.aiReviewLog?.[0] || null,
      });
      freshUser.dailyAiUsage = freshUser.dailyAiUsage || {};
      freshUser.dailyAiUsage[dayKey] = freshUsed + 1;
      saveUser(freshUser);
      if (limit && !isProUser(freshUser)) {
        const left = Math.max(0, FREE_DAILY_AI_LIMIT - freshUser.dailyAiUsage[dayKey]);
        limit.innerHTML = `<strong>${left} / ${FREE_DAILY_AI_LIMIT}</strong><span>бесплатных AI messages осталось сегодня</span><a href="pro.html">Открыть Pro</a>`;
      }
    } catch (error) {
      answer.textContent = `AI не смог ответить: ${error.message}`;
    }
  });
}

function initAuth() {
  const form = document.querySelector("[data-auth-form]");
  if (!form) return;
  const methodInput = form.querySelector("[data-auth-method-input]");
  const emailField = form.querySelector("[data-email-field]");
  const passwordField = form.querySelector("[data-password-field]");
  const emailInput = form.querySelector("#email");
  const passwordInput = form.querySelector("#password");
  const submit = form.querySelector("[data-auth-submit]");
  const avatarInput = form.querySelector("[data-avatar-input]");

  if (isFileMode()) {
    setAuthStatus(
      "Google/Firebase не работает через file://. Откройте http://127.0.0.1:8001/login.html",
    );
    submit.disabled = true;
    submit.textContent = "Откройте через локальный сервер";
    return;
  }

  function setMethod(method) {
    methodInput.value = method;
    form.querySelectorAll("[data-auth-method]").forEach((button) => {
      button.classList.toggle("active", button.dataset.authMethod === method);
    });
    emailField.style.display = method === "email" ? "grid" : "none";
    passwordField.style.display = method === "email" ? "grid" : "none";
    emailInput.required = method === "email";
    passwordInput.required = method === "email";
    submit.textContent =
      method === "google"
        ? firebaseReady
          ? "Продолжить через Google"
          : "Готовим Google вход..."
        : method === "email"
          ? "Войти или создать аккаунт"
          : "Продолжить как гость";
    submit.disabled = method === "google" && !firebaseReady;
  }

  form.querySelectorAll("[data-auth-method]").forEach((button) => {
    button.addEventListener("click", () =>
      setMethod(button.dataset.authMethod),
    );
  });

  form.querySelectorAll("[data-avatar-id]").forEach((button) => {
    button.addEventListener("click", () => {
      avatarInput.value = button.dataset.avatarId;
      form.querySelectorAll("[data-avatar-id]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
    });
  });

  setMethod(methodInput.value);
  setAuthStatus(
    localStorage.getItem("sudokuAuthDebug") || "Подключаем Firebase Auth...",
  );
  getFirebaseServices()
    .then(() => {
      firebaseReady = true;
      setAuthStatus("Firebase Auth подключен. Можно входить через Google.");
      if (methodInput.value === "google") setMethod("google");
    })
    .catch((error) => {
      console.error(error);
      if (methodInput.value === "google") {
        submit.disabled = true;
        submit.textContent = "Google недоступен";
      }
      setAuthStatus(firebaseAuthErrorMessage(error));
      toast(firebaseAuthErrorMessage(error));
    });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const method = data.get("method").toString();
    const email = data.get("email").toString().trim().toLowerCase();
    const password = data.get("password").toString();
    const name = data.get("name").toString().trim();
    const city = data.get("city").toString();
    const avatarId = data.get("avatarId").toString();
    const accounts = getAccounts();
    const id = method === "google" ? "" : accountIdFor(method, email);
    const nicknameTaken = Object.values(accounts).some((account) => {
      const sameEmailAccount =
        method === "email" &&
        account.email?.toLowerCase() === email;
      return (
        account.name.toLowerCase() === name.toLowerCase() &&
        account.id !== id &&
        !sameEmailAccount
      );
    });

    if (method !== "google" && nicknameTaken) {
      toast("Этот никнейм уже занят. Выберите другой.");
      return;
    }

    if (method === "email" && password.length < 6) {
      toast("Пароль должен быть минимум 6 символов.");
      return;
    }

    if (method === "google") {
      try {
        submit.disabled = true;
        submit.textContent = "Переходим в Google...";
        setAuthStatus("Запускаем redirect в Google...");
        await signInWithGoogleProfile({ name, city, avatarId });
      } catch (error) {
        console.error(error);
        setAuthStatus(firebaseAuthErrorMessage(error));
        toast(firebaseAuthErrorMessage(error));
        submit.disabled = false;
        setMethod("google");
      }
      return;
    }

    let firebaseEmailUser = null;
    if (method === "email") {
      try {
        submit.disabled = true;
        submit.textContent = "Проверяем почту...";
        const credential = await signInOrCreateEmailUser({ email, password });
        firebaseEmailUser = credential.user;
      } catch (error) {
        console.error(error);
        toast(firebaseAuthErrorMessage(error));
        submit.disabled = false;
        setMethod("email");
        return;
      }
    }

    const emailId = firebaseEmailUser ? `email:${firebaseEmailUser.uid}` : id;
    const existing = findAccount(emailId) || findAccount(id);

    const user =
      existing ||
      createUserProfile({
        id: emailId,
        name,
        city,
        method,
        email,
        avatarId,
      });

    user.name = name;
    user.city = city;
    user.method = method;
    user.email = email;
    user.avatarId = avatarId;
    user.signedIn = true;
    if (firebaseEmailUser) user.firebaseUid = firebaseEmailUser.uid;
    if (method === "email") user.password = password;
    saveUser(user);
    saveFirebaseProfile(user);
    updateTopbar();
    toast(
      existing
        ? "Вы вошли в свой аккаунт."
        : "Аккаунт создан. Статистика начинается с нуля.",
    );
    window.setTimeout(() => (location.href = "profile.html"), 700);
  });
}

function initProButtons() {
  document.querySelectorAll("[data-pro]").forEach((button) => {
    button.addEventListener("click", () => {
      location.href = "pro.html";
    });
  });
}

function activatePro(user = getUser(), message = "Pro активирован.") {
  user.pro = true;
  saveUser(user);
  saveFirebaseProfile(user);
  updateTopbar();
  toast(message);
}

function boot() {
  if (redirectFileModeToLocalServer()) return;
  injectThemeToggle();
  applyTheme();
  updateTopbar();
  setActiveNav();
  renderVisualBoard();
  renderDifficulties();
  renderDifficultyLevelPage();
  renderLeaderboard();
  renderProfile();
  renderEarnProBlocks();
  renderAiCoachPage();
  initAuth();
  finishGoogleRedirectIfNeeded();
  initGame();
  initProButtons();
}

document.addEventListener("DOMContentLoaded", boot);
