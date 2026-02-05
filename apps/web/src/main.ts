import "./style.css";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

const connectButton = document.getElementById("connect") as HTMLButtonElement;
const openWalletButton = document.getElementById("openWallet") as HTMLButtonElement;
const startWatchButton = document.getElementById("startWatch") as HTMLButtonElement;
const completeWatchButton = document.getElementById("completeWatch") as HTMLButtonElement;
const createAdButton = document.getElementById("createAd") as HTMLButtonElement;
const createCampaignButton = document.getElementById("createCampaign") as HTMLButtonElement;

const dailyCapEl = document.getElementById("dailyCap") as HTMLElement;
const coinPerWatchEl = document.getElementById("coinPerWatch") as HTMLElement;
const balanceEl = document.getElementById("balance") as HTMLElement;
const ledgerEl = document.getElementById("ledger") as HTMLElement;
const adMediaEl = document.getElementById("adMedia") as HTMLElement;

let currentAdId: string | null = null;
let currentViewId: string | null = null;
let fingerprint = localStorage.getItem("adbot_fingerprint");
let minWatchSeconds = 15;
let watchStartAt = 0;
let canComplete = false;

if (!fingerprint) {
  fingerprint = crypto.randomUUID();
  localStorage.setItem("adbot_fingerprint", fingerprint);
}

function getToken() {
  return localStorage.getItem("adbot_token");
}

function setToken(token: string) {
  localStorage.setItem("adbot_token", token);
}

async function fetchSettings() {
  const res = await fetch(`${apiUrl}/settings`);
  const data = await res.json();
  dailyCapEl.textContent = `${data.maxDailyCoins} coins`;
  coinPerWatchEl.textContent = `${data.coinsPerWatch} coins`;
  minWatchSeconds = Number(data.minWatchSeconds ?? 15);
}

async function fetchWallet() {
  const token = getToken();
  if (!token) return;
  const res = await fetch(`${apiUrl}/wallet`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return;
  const data = await res.json();
  balanceEl.textContent = `${data.wallet?.balance ?? 0} coins`;
  ledgerEl.innerHTML = "";
  data.ledger.forEach((entry: any) => {
    const li = document.createElement("li");
    li.textContent = `${entry.reason} ${entry.delta} (${new Date(entry.createdAt).toLocaleString()})`;
    ledgerEl.appendChild(li);
  });
}

async function connectTelegram() {
  // @ts-ignore
  const initData = window.Telegram?.WebApp?.initData;
  if (!initData) {
    alert("Open this page inside Telegram to connect.");
    return;
  }
  const res = await fetch(`${apiUrl}/auth/telegram`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData })
  });
  const data = await res.json();
  if (res.ok) {
    setToken(data.token);
    await fetchWallet();
  } else {
    alert(data.error ?? "Auth failed");
  }
}

async function startWatch() {
  const token = getToken();
  if (!token) return alert("Connect Telegram first");
  const queueRes = await fetch(`${apiUrl}/ads/queue`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const queue = await queueRes.json();
  if (!queue.ad) {
    adMediaEl.textContent = "No ads available right now.";
    return;
  }
  currentAdId = queue.ad.id;
  canComplete = false;
  completeWatchButton.disabled = true;
  watchStartAt = Date.now();
  if (queue.ad.type === "banner" && queue.ad.mediaUrl) {
    adMediaEl.innerHTML = `<img src=\"${queue.ad.mediaUrl}\" alt=\"${queue.ad.title}\" style=\"max-width:100%; border-radius:12px;\" />`;
    const notice = document.createElement("p");
    notice.textContent = `Viewing banner... ${minWatchSeconds}s`;
    adMediaEl.appendChild(notice);
    let remaining = minWatchSeconds;
    const timer = setInterval(() => {
      remaining -= 1;
      notice.textContent = `Viewing banner... ${remaining}s`;
      if (remaining <= 0) {
        clearInterval(timer);
        canComplete = true;
        completeWatchButton.disabled = false;
        notice.textContent = "Banner view completed.";
      }
    }, 1000);
  } else if (queue.ad.mediaUrl) {
    adMediaEl.innerHTML = `<video src=\"${queue.ad.mediaUrl}\" controls style=\"max-width:100%; border-radius:12px;\"></video>`;
    const video = adMediaEl.querySelector("video");
    if (video) {
      video.addEventListener("loadedmetadata", () => {
        video.dataset.duration = String(Math.floor(video.duration));
      });
      video.addEventListener("ended", () => {
        canComplete = true;
        completeWatchButton.disabled = false;
      });
    }
  } else {
    adMediaEl.textContent = `${queue.ad.title} (${queue.ad.type})`;
  }
  const startRes = await fetch(`${apiUrl}/ads/${currentAdId}/view/start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-client-fingerprint": fingerprint
    }
  });
  const startData = await startRes.json();
  currentViewId = startData.viewId;
}

async function completeWatch() {
  const token = getToken();
  if (!token || !currentAdId || !currentViewId) return;
  if (!canComplete) {
    alert("Please finish viewing the ad first.");
    return;
  }
  const watchedSeconds = Math.floor((Date.now() - watchStartAt) / 1000);
  const res = await fetch(`${apiUrl}/ads/${currentAdId}/view/complete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-client-fingerprint": fingerprint
    },
    body: JSON.stringify({
      viewId: currentViewId,
      watchedSeconds,
      clientCompleted: true
    })
  });
  const data = await res.json();
  if (res.ok) {
    alert(`Reward: ${data.reward} coins`);
    await fetchWallet();
  } else {
    alert(data.error ?? "Failed to complete");
  }
}

async function createAd() {
  const token = getToken();
  if (!token) return alert("Connect Telegram first");
  const title = (document.getElementById("adTitle") as HTMLInputElement).value;
  const type = (document.getElementById("adType") as HTMLSelectElement).value;
  const mediaKeyInput = document.getElementById("mediaKey") as HTMLInputElement;
  const fileInput = document.getElementById("adFile") as HTMLInputElement;

  let mediaKey = mediaKeyInput.value;
  const file = fileInput.files?.[0];
  let mediaDurationSeconds: number | undefined;
  if (file && !mediaKey) {
    if (type === "video") {
      mediaDurationSeconds = await new Promise<number | undefined>((resolve) => {
        const tempVideo = document.createElement("video");
        tempVideo.preload = "metadata";
        tempVideo.onloadedmetadata = () => {
          const duration = Math.floor(tempVideo.duration);
          resolve(Number.isFinite(duration) ? duration : undefined);
        };
        tempVideo.onerror = () => resolve(undefined);
        tempVideo.src = URL.createObjectURL(file);
      });
    }
    const uploadRes = await fetch(`${apiUrl}/ads/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size
      })
    });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) {
      alert(uploadData.error ?? "Upload init failed");
      return;
    }
    await fetch(uploadData.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file
    });
    mediaKey = uploadData.key;
    mediaKeyInput.value = mediaKey;
  }

  const res = await fetch(`${apiUrl}/ads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ title, type, mediaKey, mediaDurationSeconds })
  });
  const data = await res.json();
  if (res.ok) {
    if (type === "video" && !mediaDurationSeconds) {
      await fetch(`${apiUrl}/ads/${data.ad.id}/ingest-duration`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
    }
    alert(`Ad submitted: ${data.ad.id}`);
  } else {
    alert(data.error ?? "Failed to submit ad");
  }
}

async function createCampaign() {
  const token = getToken();
  if (!token) return alert("Connect Telegram first");
  const adId = (document.getElementById("campaignAdId") as HTMLInputElement).value;
  const budgetRaw = (document.getElementById("campaignBudget") as HTMLInputElement).value;
  const budgetCoins = budgetRaw ? Number(budgetRaw) : undefined;

  const res = await fetch(`${apiUrl}/campaigns`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ adId, budgetCoins })
  });
  const data = await res.json();
  if (res.ok) {
    alert(`Campaign started: ${data.campaign.id}`);
    await fetchWallet();
  } else {
    alert(data.error ?? "Failed to start campaign");
  }
}

connectButton.addEventListener("click", connectTelegram);
openWalletButton.addEventListener("click", fetchWallet);
startWatchButton.addEventListener("click", startWatch);
completeWatchButton.addEventListener("click", completeWatch);
createAdButton.addEventListener("click", createAd);
createCampaignButton.addEventListener("click", createCampaign);

completeWatchButton.disabled = true;

fetchSettings();
fetchWallet();
