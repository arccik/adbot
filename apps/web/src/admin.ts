import "./admin.css";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

const adminKeyInput = document.getElementById("adminKey") as HTMLInputElement;
const loadButton = document.getElementById("loadData") as HTMLButtonElement;
const moderationEl = document.getElementById("moderation") as HTMLElement;
const fraudEl = document.getElementById("fraud") as HTMLElement;
const adjustmentsEl = document.getElementById("adjustments") as HTMLElement;
const campaignsEl = document.getElementById("campaigns") as HTMLElement;
const campaignQuery = document.getElementById("campaignQuery") as HTMLInputElement;
const campaignStatus = document.getElementById("campaignStatus") as HTMLSelectElement;
const campaignFilter = document.getElementById("campaignFilter") as HTMLButtonElement;
const adjustUserId = document.getElementById("adjustUserId") as HTMLInputElement;
const adjustDelta = document.getElementById("adjustDelta") as HTMLInputElement;
const adjustButton = document.getElementById("adjustCoins") as HTMLButtonElement;
const adjustStatus = document.getElementById("adjustStatus") as HTMLElement;

function getHeaders() {
  return {
    "x-admin-key": adminKeyInput.value
  } as Record<string, string>;
}

async function loadModeration() {
  const res = await fetch(`${apiUrl}/admin/moderation`, { headers: getHeaders() });
  const data = await res.json();
  moderationEl.innerHTML = "";
  if (!res.ok) {
    moderationEl.textContent = data.error ?? "Failed to load moderation.";
    return;
  }

  if (!data.items.length) {
    moderationEl.textContent = "No pending ads.";
    return;
  }

  data.items.forEach((item: any) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <strong>${item.ad.title}</strong>
      <div class="meta">${item.ad.id} · ${item.ad.type}</div>
      <div class="meta">Media key: ${item.ad.mediaKey}</div>
      ${item.ad.mediaUrl ? `<a href="${item.ad.mediaUrl}" target="_blank">Open media</a>` : ""}
    `;
    const actions = document.createElement("div");
    actions.className = "actions";

    const approve = document.createElement("button");
    approve.textContent = "Approve";
    approve.onclick = async () => {
      await fetch(`${apiUrl}/admin/moderation/${item.adId}/approve`, {
        method: "POST",
        headers: getHeaders()
      });
      await loadModeration();
    };

    const reject = document.createElement("button");
    reject.textContent = "Reject";
    reject.onclick = async () => {
      const notes = prompt("Rejection notes?") ?? "";
      await fetch(`${apiUrl}/admin/moderation/${item.adId}/reject`, {
        method: "POST",
        headers: { ...getHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ notes })
      });
      await loadModeration();
    };

    actions.appendChild(approve);
    actions.appendChild(reject);
    card.appendChild(actions);
    moderationEl.appendChild(card);
  });
}

async function loadFraud() {
  const res = await fetch(`${apiUrl}/admin/fraud`, { headers: getHeaders() });
  const data = await res.json();
  fraudEl.innerHTML = "";
  if (!res.ok) {
    fraudEl.textContent = data.error ?? "Failed to load fraud flags.";
    return;
  }

  if (!data.flags.length) {
    fraudEl.textContent = "No fraud flags.";
    return;
  }

  data.flags.forEach((flag: any) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <strong>${flag.reason}</strong>
      <div class="meta">User: ${flag.userId}</div>
      <div class="meta">Severity: ${flag.severity}</div>
      <div class="meta">${new Date(flag.createdAt).toLocaleString()}</div>
    `;
    fraudEl.appendChild(card);
  });
}

async function loadAdjustments() {
  const res = await fetch(`${apiUrl}/admin/ledger/adjustments`, { headers: getHeaders() });
  const data = await res.json();
  adjustmentsEl.innerHTML = "";
  if (!res.ok) {
    adjustmentsEl.textContent = data.error ?? "Failed to load adjustments.";
    return;
  }
  if (!data.entries.length) {
    adjustmentsEl.textContent = "No adjustments yet.";
    return;
  }
  data.entries.forEach((entry: any) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <strong>${entry.delta} coins</strong>
      <div class="meta">User: ${entry.user?.telegramId ?? entry.userId}</div>
      <div class="meta">${new Date(entry.createdAt).toLocaleString()}</div>
    `;
    adjustmentsEl.appendChild(card);
  });
}

async function loadCampaigns() {
  const params = new URLSearchParams();
  if (campaignQuery.value.trim()) {
    params.set("query", campaignQuery.value.trim());
  }
  if (campaignStatus.value) {
    params.set("status", campaignStatus.value);
  }
  const url = params.toString() ? `${apiUrl}/admin/campaigns?${params.toString()}` : `${apiUrl}/admin/campaigns`;
  const res = await fetch(url, { headers: getHeaders() });
  const data = await res.json();
  campaignsEl.innerHTML = "";
  if (!res.ok) {
    campaignsEl.textContent = data.error ?? "Failed to load campaigns.";
    return;
  }
  if (!data.campaigns.length) {
    campaignsEl.textContent = "No campaigns.";
    return;
  }
  data.campaigns.forEach((campaign: any) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <strong>${campaign.ad?.title ?? "Ad"}</strong>
      <div class="meta">Campaign: ${campaign.id}</div>
      <div class="meta">Owner: ${campaign.owner?.telegramId ?? campaign.ownerId}</div>
      <div class="meta">Status: ${campaign.status}</div>
      <div class="meta">Spend: ${campaign.spendCoins}/${campaign.budgetCoins}</div>
    `;
    const actions = document.createElement("div");
    actions.className = "actions";

    const pause = document.createElement("button");
    pause.textContent = "Pause";
    pause.disabled = campaign.status === "PAUSED" || campaign.status === "COMPLETED";
    pause.onclick = async () => {
      await fetch(`${apiUrl}/admin/campaigns/${campaign.id}/pause`, {
        method: "POST",
        headers: getHeaders()
      });
      await loadCampaigns();
    };

    const resume = document.createElement("button");
    resume.textContent = "Resume";
    resume.disabled = campaign.status === "ACTIVE" || campaign.status === "COMPLETED";
    resume.onclick = async () => {
      await fetch(`${apiUrl}/admin/campaigns/${campaign.id}/resume`, {
        method: "POST",
        headers: getHeaders()
      });
      await loadCampaigns();
    };

    actions.appendChild(pause);
    actions.appendChild(resume);
    card.appendChild(actions);
    campaignsEl.appendChild(card);
  });
}

loadButton.addEventListener("click", async () => {
  await loadModeration();
  await loadAdjustments();
  await loadCampaigns();
  await loadFraud();
});

campaignFilter.addEventListener("click", async () => {
  await loadCampaigns();
});

adjustButton.addEventListener("click", async () => {
  const userId = adjustUserId.value.trim();
  const delta = Number(adjustDelta.value);
  if (!userId || Number.isNaN(delta)) {
    adjustStatus.textContent = "Enter a user ID and delta.";
    return;
  }
  const res = await fetch(`${apiUrl}/admin/users/${userId}/adjust-coins`, {
    method: "POST",
    headers: { ...getHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ delta })
  });
  if (res.ok) {
    adjustStatus.textContent = "Coins adjusted.";
    adjustDelta.value = "";
    await loadAdjustments();
  } else {
    const data = await res.json();
    adjustStatus.textContent = data.error ?? "Failed to adjust coins.";
  }
});
