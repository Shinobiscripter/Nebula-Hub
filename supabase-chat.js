// supabase-chat.js
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Your Supabase project config
const SUPABASE_URL = "https://aokbylwdfdgyojhrdjuf.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFva2J5bHdkZmRneW9qaHJkanVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4MzI0MzAsImV4cCI6MjA3OTQwODQzMH0.9fFJBxJa_iYHZMWBwLwGO3U036Cis2bTgUY5s9LpzLY";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// -------------------------------------------------------------
// DOM ELEMENTS
// -------------------------------------------------------------

// Auth + global chat
const authStatusTitle = document.getElementById("authStatusTitle");
const authSignedOut = document.getElementById("authSignedOut");
const authSignedIn = document.getElementById("authSignedIn");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authUsername = document.getElementById("authUsername");
const authUserNameLabel = document.getElementById("authUserNameLabel");
const signUpBtn = document.getElementById("authSignUpBtn");
const signInBtn = document.getElementById("authSignInBtn");
const signOutBtn = document.getElementById("authSignOutBtn");

const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSendBtn");
const chatHint = document.getElementById("chatHint");

// Private groups + group chat
const groupList = document.getElementById("groupList");
const newGroupNameInput = document.getElementById("newGroupName");
const createGroupBtn = document.getElementById("createGroupBtn");

const currentGroupNameEl = document.getElementById("currentGroupName");
const groupChatMessages = document.getElementById("groupChatMessages");
const groupChatInput = document.getElementById("groupChatInput");
const groupChatSendBtn = document.getElementById("groupChatSendBtn");

// Add members to group
const addMemberUsernameInput = document.getElementById("addMemberUsernameInput");
const addMemberBtn = document.getElementById("addMemberBtn");

// Friends
const friendsList = document.getElementById("friendsList");
const friendUsernameInput = document.getElementById("friendUsernameInput");
const addFriendBtn = document.getElementById("addFriendBtn");


let currentUser = null;
let currentProfile = null;

// private-group state
let currentGroupId = null;
let groupMessagesChannel = null;

// -------------------------------------------------------------
// AUTH HELPERS
// -------------------------------------------------------------

async function loadProfile(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("profile error", error);
    return null;
  }
  return data;
}

async function ensureProfile(userId, username) {
  if (!userId) return;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("profile fetch error", error);
  }
  if (data) return data;

  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .insert([{ id: userId, username }])
    .select()
    .maybeSingle();

  if (insertError) {
    console.warn("profile insert error", insertError);
    return null;
  }

  return created;
}

function updateAuthUI() {
  if (!authStatusTitle) return;
  if (!currentUser) {
    authStatusTitle.textContent = "Not signed in";
    if (authSignedOut) authSignedOut.style.display = "block";
    if (authSignedIn) authSignedIn.style.display = "none";
    if (chatHint) chatHint.textContent = "You must be signed in to chat.";
  } else {
    const name = currentProfile?.username || currentUser.email || "User";
    authStatusTitle.textContent = "Signed in";
    if (authSignedOut) authSignedOut.style.display = "none";
    if (authSignedIn) authSignedIn.style.display = "block";
    if (authUserNameLabel) authUserNameLabel.textContent = name;
    if (chatHint)
      chatHint.textContent = "Global chat – be chill and respect others.";
  }
}

// -------------------------------------------------------------
// AUTH EVENTS
// -------------------------------------------------------------

// Sign up
signUpBtn?.addEventListener("click", async () => {
  const email = authEmail.value.trim();
  const password = authPassword.value.trim();
  const username = authUsername.value.trim() || "Player";

  if (!email || !password) {
    alert("Email and password are required.");
    return;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    alert("Sign up error: " + error.message);
    return;
  }

  if (data.user) {
    await ensureProfile(data.user.id, username);
    alert("Account created! Check your email if confirmation is required.");
  }
});

// Sign in
signInBtn?.addEventListener("click", async () => {
  const email = authEmail.value.trim();
  const password = authPassword.value.trim();

  if (!email || !password) {
    alert("Email and password are required.");
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    alert("Login error: " + error.message);
    return;
  }

  if (data.user) {
    currentUser = data.user;
    currentProfile = await loadProfile(currentUser.id);
    updateAuthUI();
    refreshGroups();
  }
});

// Sign out
signOutBtn?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  currentUser = null;
  currentProfile = null;
  updateAuthUI();
  clearGroupState();
});

// Listen for auth changes (covers page refresh)
supabase.auth.onAuthStateChange(async (event, session) => {
  currentUser = session?.user ?? null;
  if (currentUser) {
    currentProfile = await loadProfile(currentUser.id);
  } else {
    currentProfile = null;
  }
  updateAuthUI();
  refreshGroups();
});

// -------------------------------------------------------------
// GLOBAL CHAT
// -------------------------------------------------------------

function renderMessage(msg) {
  if (!chatMessages) return;
  const div = document.createElement("div");
  const name = msg.username || "User";
  const time = msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString()
    : "";
  div.textContent = `[${time}] ${name}: ${msg.content}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function loadInitialMessages() {
  if (!chatMessages) return;
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.warn("load messages error", error);
    return;
  }
  chatMessages.innerHTML = "";
  data.forEach(renderMessage);
}

chatSendBtn?.addEventListener("click", async () => {
  if (!currentUser) {
    alert("You must be signed in to send messages.");
    return;
  }
  const text = chatInput.value.trim();
  if (!text) return;

  const username = currentProfile?.username || currentUser.email || "User";

  const { error } = await supabase.from("messages").insert([
    {
      user_id: currentUser.id,
      username,
      content: text,
    },
  ]);

  if (error) {
    alert("Send failed: " + error.message);
    return;
  }
  chatInput.value = "";
});

// send on Enter (global)
chatInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    chatSendBtn.click();
  }
});

// Realtime subscription for global chat
supabase
  .channel("public:messages")
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "messages" },
    (payload) => {
      renderMessage(payload.new);
    }
  )
  .subscribe();

// -------------------------------------------------------------
// PRIVATE GROUPS + GROUP CHAT
// -------------------------------------------------------------

function clearGroupState() {
  if (groupList) groupList.innerHTML = "";
  if (currentGroupNameEl) currentGroupNameEl.textContent = "No group selected";
  if (groupChatMessages) groupChatMessages.innerHTML = "";
  currentGroupId = null;

  if (groupMessagesChannel) {
    supabase.removeChannel(groupMessagesChannel);
    groupMessagesChannel = null;
  }
}

// Load list of groups the user belongs to
async function refreshGroups() {
  if (!groupList) return;

  if (!currentUser) {
    groupList.innerHTML = "<span>Sign in to see your private groups.</span>";
    clearGroupState();
    return;
  }

  const { data, error } = await supabase
    .from("groups")
    .select("id, name, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("load groups error", error);
    groupList.innerHTML = "<span>Could not load groups.</span>";
    return;
  }

  if (!data || data.length === 0) {
    groupList.innerHTML = "<span>No groups yet. Create one below.</span>";
    return;
  }

  groupList.innerHTML = "";
  data.forEach((group) => {
    const btn = document.createElement("button");
    btn.textContent = group.name;
    btn.className = "btn btn-ghost";
    btn.style.width = "100%";
    btn.style.justifyContent = "flex-start";
    btn.style.marginBottom = "4px";
    btn.addEventListener("click", () => {
      selectGroup(group);
    });
    groupList.appendChild(btn);
  });
}

function renderGroupMessage(msg) {
  if (!groupChatMessages) return;
  const div = document.createElement("div");
  const name = msg.username || "User";
  const time = msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString()
    : "";
  div.textContent = `[${time}] ${name}: ${msg.content}`;
  groupChatMessages.appendChild(div);
  groupChatMessages.scrollTop = groupChatMessages.scrollHeight;
}

async function loadGroupMessages(groupId) {
  if (!groupChatMessages || !groupId) return;

  const { data, error } = await supabase
    .from("group_messages")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.warn("load group messages error", error);
    return;
  }

  groupChatMessages.innerHTML = "";
  data.forEach(renderGroupMessage);
}

function subscribeToGroupMessages(groupId) {
  if (!groupId) return;

  if (groupMessagesChannel) {
    supabase.removeChannel(groupMessagesChannel);
    groupMessagesChannel = null;
  }

  groupMessagesChannel = supabase
    .channel(`group:${groupId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "group_messages",
        filter: `group_id=eq.${groupId}`,
      },
      (payload) => {
        renderGroupMessage(payload.new);
      }
    )
    .subscribe();
}

async function selectGroup(group) {
  currentGroupId = group.id;
  if (currentGroupNameEl) currentGroupNameEl.textContent = group.name;
  await loadGroupMessages(group.id);
  subscribeToGroupMessages(group.id);
}

// Create group
createGroupBtn?.addEventListener("click", async () => {
  if (!currentUser) {
    alert("You must be signed in to create groups.");
    return;
  }

// Add a member to the current group by username
addMemberBtn?.addEventListener("click", async () => {
  if (!currentUser) {
    alert("You must be signed in to add members.");
    return;
  }
  if (!currentGroupId) {
    alert("Select a group first.");
    return;
  }
  const username = addMemberUsernameInput.value.trim();
  if (!username) {
    alert("Enter a username.");
    return;
  }

  // Find user by username
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username")
    .ilike("username", username)
    .maybeSingle();

  if (error || !profile) {
    alert("No user found with that username.");
    return;
  }

  if (profile.id === currentUser.id) {
    alert("You're already in the group.");
    return;
  }

  // Insert into group_members (RLS ensures only current members can do this)
  const { error: insertErr } = await supabase.from("group_members").insert([
    {
      group_id: currentGroupId,
      user_id: profile.id,
    },
  ]);

  if (insertErr) {
    alert("Could not add member: " + insertErr.message);
    return;
  }

  addMemberUsernameInput.value = "";
  alert(`Added ${profile.username || "user"} to the group!`);
});

  
  const name = newGroupNameInput.value.trim();
  if (!name) {
    alert("Group name is required.");
    return;
  }

  const { data, error } = await supabase
    .from("groups")
    .insert([{ name, is_private: true, created_by: currentUser.id }])
    .select()
    .maybeSingle();

  if (error) {
    alert("Could not create group: " + error.message);
    return;
  }

  // add creator as member
  if (data) {
    await supabase.from("group_members").insert([
      {
        group_id: data.id,
        user_id: currentUser.id,
      },
    ]);

    newGroupNameInput.value = "";
    await refreshGroups();
    await selectGroup(data);
  }
});

// Send message to current group
groupChatSendBtn?.addEventListener("click", async () => {
  if (!currentUser) {
    alert("You must be signed in to chat in groups.");
    return;
  }
  if (!currentGroupId) {
    alert("Select a group first.");
    return;
  }
  const text = groupChatInput.value.trim();
  if (!text) return;

  const username = currentProfile?.username || currentUser.email || "User";

  const { error } = await supabase.from("group_messages").insert([
    {
      group_id: currentGroupId,
      user_id: currentUser.id,
      username,
      content: text,
    },
  ]);

  if (error) {
    alert("Send failed: " + error.message);
    return;
  }
  groupChatInput.value = "";
});

// send on Enter (group)
groupChatInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    groupChatSendBtn.click();
  }
});

// -------------------------------------------------------------
// FRIENDS LIST
// -------------------------------------------------------------

async function loadFriends() {
  if (!friendsList) return;

  if (!currentUser) {
    friendsList.innerHTML = "<span>Sign in to see your friends.</span>";
    return;
  }

  // Get all friendships where the user is either side
  const { data, error } = await supabase
    .from("friends")
    .select("id, user_id, friend_id, status")
    .or(`user_id.eq.${currentUser.id},friend_id.eq.${currentUser.id}`)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("loadFriends error", error);
    friendsList.innerHTML = "<span>Could not load friends.</span>";
    return;
  }

  if (!data || data.length === 0) {
    friendsList.innerHTML = "<span>No friends yet. Add some!</span>";
    return;
  }

  // Collect "other user" ids
  const otherIds = [];
  const friendRows = [];

  data.forEach((row) => {
    const otherId = row.user_id === currentUser.id ? row.friend_id : row.user_id;
    if (!otherId) return;
    otherIds.push(otherId);
    friendRows.push({ ...row, otherId });
  });

  if (otherIds.length === 0) {
    friendsList.innerHTML = "<span>No friends yet.</span>";
    return;
  }

  // Fetch usernames for those ids
  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, username")
    .in("id", otherIds);

  if (profErr) {
    console.warn("friends profiles error", profErr);
  }

  const nameById = {};
  (profiles || []).forEach((p) => {
    nameById[p.id] = p.username || "User";
  });

  friendsList.innerHTML = "";
  friendRows.forEach((row) => {
    const li = document.createElement("div");
    const name = nameById[row.otherId] || "User";
    li.textContent = `${name}`;
    friendsList.appendChild(li);
  });
}

// Add friend by username
addFriendBtn?.addEventListener("click", async () => {
  if (!currentUser) {
    alert("You must be signed in to add friends.");
    return;
  }
  const username = friendUsernameInput.value.trim();
  if (!username) {
    alert("Enter a username.");
    return;
  }

  // Find that user by username in profiles
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, username")
    .ilike("username", username)
    .maybeSingle();

  if (error || !profile) {
    alert("No user found with that username.");
    return;
  }

  if (profile.id === currentUser.id) {
    alert("You can't add yourself.");
    return;
  }

  // Create friendship row (auto-accepted for now)
  const { error: insertErr } = await supabase.from("friends").insert([
    {
      user_id: currentUser.id,
      friend_id: profile.id,
      status: "accepted",
    },
  ]);

  if (insertErr) {
    alert("Could not add friend: " + insertErr.message);
    return;
  }

  friendUsernameInput.value = "";
  await loadFriends();
});


// -------------------------------------------------------------
// INIT
// -------------------------------------------------------------

// Global chat messages
loadInitialMessages();
// Groups will refresh when auth state listener fires on load
