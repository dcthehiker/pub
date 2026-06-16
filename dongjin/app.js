/**
 * 东晋门阀政治 - 知识图谱漫游引擎 (app.js)
 * Light Scholarly Theme & 50vh Snap-Scroll In-Place Branch Walker
 */

// Global State
let kgData = null;
let entitiesByName = {};
let relationshipsByEntity = {};
let visitedEntities = new Set(); // Track visited entities during roam to avoid immediate loops

// Cards Data representation for the active scroll path
// Each entry: { name: string, candidates: Array, activeChoice: number }
let cardsData = []; 
let currentTopIndex = 0;
let cardHeight = 0;
let scrollTimeout = null;

// DOM Elements
const viewport = document.getElementById("viewport-scroll-container");
const scrollIndicator = document.getElementById("scroll-indicator");

// Fixed Central Divider Elements
const dividerTriggerBtn = document.getElementById("divider-trigger-btn");
const relationDetailPopup = document.getElementById("relation-detail-popup");
const popupCloseBtn = document.getElementById("popup-close-btn");
const popupRelType = document.getElementById("popup-rel-type");
const popupRelDesc = document.getElementById("popup-rel-desc");

// Drawers & Sheets
const detailOverlay = document.getElementById("detail-overlay");
const detailSheet = document.getElementById("detail-sheet");
const detailCloseBtn = document.getElementById("detail-close-btn");
const detailTitle = document.getElementById("detail-title");
const detailBadge = document.getElementById("detail-badge");
const detailDescList = document.getElementById("detail-desc-list");
const detailConnections = document.getElementById("detail-connections");

const indexOverlay = document.getElementById("index-overlay");
const indexDrawer = document.getElementById("index-drawer");
const menuBtn = document.getElementById("menu-btn");
const indexCloseBtn = document.getElementById("index-close-btn");
const searchInput = document.getElementById("search-input");
const indexList = document.getElementById("index-list");
const filterChips = document.querySelectorAll(".filter-chip");

const welcomeOverlay = document.getElementById("welcome-overlay");
const startBtn = document.getElementById("start-btn");

// Helper: Map entity type to CSS class suffixes
function getTypeClass(type) {
  const map = {
    "核心人物": "person",
    "士族与集团": "group",
    "地理位置": "location",
    "政治局势与制度": "system",
    "重要历史事件": "event"
  };
  return map[type] || "person";
}

/* ==========================================================================
   1. Data Loading & Initialization
   ========================================================================== */
async function init() {
  try {
    const response = await fetch("dongjin_kg.json");
    kgData = await response.json();
    
    // Index entities by name for constant-time lookup
    kgData.entities.forEach(entity => {
      entitiesByName[entity.name] = entity;
      relationshipsByEntity[entity.name] = [];
    });

    // Index relationships by entity name (both directions)
    kgData.relationships.forEach(rel => {
      if (relationshipsByEntity[rel.source]) {
        relationshipsByEntity[rel.source].push(rel);
      }
      if (relationshipsByEntity[rel.target]) {
        relationshipsByEntity[rel.target].push(rel);
      }
    });

    // Setup Event Listeners
    setupEventListeners();
    
    // Populate Side Index list
    renderIndexList();

    // Setup dimensions and start
    updateDimensions();
    window.addEventListener("resize", updateDimensions);

    // Initialize Roaming Mode with "司马睿 (晋元帝)" as starter
    startRoaming("司马睿 (晋元帝)");

  } catch (error) {
    console.error("Failed to load knowledge graph data:", error);
    alert("数据加载失败，请检查网络或刷新页面。");
  }
}

// Measures card height dynamically (exactly 50% of viewport area)
function updateDimensions() {
  cardHeight = viewport.clientHeight / 2;
}

/* ==========================================================================
   2. Event Handlers & Bindings
   ========================================================================== */
function setupEventListeners() {
  // Welcome Screen
  startBtn.addEventListener("click", () => {
    welcomeOverlay.classList.add("hidden");
    localStorage.setItem("welcomed_dongjin_roam", "true");
  });

  if (localStorage.getItem("welcomed_dongjin_roam") === "true") {
    welcomeOverlay.classList.add("hidden");
  }

  // Divider relationship pop-up click triggers
  dividerTriggerBtn.addEventListener("click", openRelationPopup);
  popupCloseBtn.addEventListener("click", closeRelationPopup);
  
  // Close popup if scrolled or clicked overlay, hide button while scrolling
  viewport.addEventListener("scroll", () => {
    closeRelationPopup();
    handleScrollTracking();
    
    // Hide button during scroll
    dividerTriggerBtn.classList.add("is-scrolling");
    
    // Clear previous timeout and set new one to fade it back in when scrolling stops
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      dividerTriggerBtn.classList.remove("is-scrolling");
    }, 150);
  }, { passive: true });

  // Detail Sheet close triggers
  detailCloseBtn.addEventListener("click", closeDetailSheet);
  detailOverlay.addEventListener("click", closeDetailSheet);

  // Side Index Drawer triggers
  menuBtn.addEventListener("click", openIndexDrawer);
  indexCloseBtn.addEventListener("click", closeIndexDrawer);
  indexOverlay.addEventListener("click", closeIndexDrawer);

  // Index search and filtering
  searchInput.addEventListener("input", filterIndex);
  filterChips.forEach(chip => {
    chip.addEventListener("click", (e) => {
      filterChips.forEach(c => c.classList.remove("active"));
      e.target.classList.add("active");
      filterIndex();
    });
  });
}

function handleScrollTips() {
  if (viewport.scrollTop > 30) {
    scrollIndicator.classList.add("fade-out");
  } else {
    scrollIndicator.classList.remove("fade-out");
  }
}

/* ==========================================================================
   3. Roaming Graph Traversal & Chain Mechanics
   ========================================================================== */
function startRoaming(startingNodeName) {
  // Clear viewport & reset state
  viewport.innerHTML = "";
  visitedEntities.clear();
  cardsData = [];
  currentTopIndex = 0;
  closeRelationPopup();
  
  // Reset scroll indicator
  scrollIndicator.classList.remove("fade-out");

  // Push Card 0 (Start node, no candidates)
  cardsData.push({
    name: startingNodeName,
    candidates: [],
    activeChoice: -1
  });
  
  visitedEntities.add(startingNodeName);

  // Append Card 0 to viewport
  const card0 = renderCardElement(0);
  viewport.appendChild(card0);

  // Append Card 1 (bottom card in view)
  appendNextStep();

  // Append Card 2 (pre-rendered card below view)
  // CRITICAL: We need at least 3 cards at startup to create overflow and enable scroll!
  appendNextStep();

  // Scroll to top
  viewport.scrollTo({ top: 0 });

  // Refresh visual state
  updateActiveCardsHighlight();
  syncDividerRelationship();
}

// Compiles neighbor choices for Card k, avoiding grandparent backtracking
function getCandidatesForNode(targetEntityName, parentEntityName = null) {
  const rawRels = relationshipsByEntity[targetEntityName] || [];
  let neighbors = rawRels.map(rel => {
    const otherName = (rel.source === targetEntityName) ? rel.target : rel.source;
    return { name: otherName, relationship: rel };
  });

  // 1. Avoid immediate backtracking back to parent if other options exist
  if (parentEntityName && neighbors.length > 1) {
    neighbors = neighbors.filter(n => n.name !== parentEntityName);
  }

  // 2. Prioritize unvisited entities to encourage walking forward
  const unvisited = neighbors.filter(n => !visitedEntities.has(n.name));
  return unvisited.length > 0 ? unvisited : neighbors;
}

// Appends the next card in the chain (k) linked to card k-1
function appendNextStep() {
  const k = cardsData.length;
  const parentNode = cardsData[k - 1];
  
  const grandparentName = (k > 1) ? cardsData[k - 2].name : null;
  const candidates = getCandidatesForNode(parentNode.name, grandparentName);

  if (candidates.length === 0) {
    console.warn(`No connections found for ${parentNode.name}, path terminated.`);
    return;
  }

  // Set default selection (index 0)
  const defaultIdx = 0;
  const selectedNode = candidates[defaultIdx];

  // Append new card metadata
  cardsData.push({
    name: selectedNode.name,
    candidates: candidates,
    activeChoice: defaultIdx
  });

  // Render and append card element
  const cardElement = renderCardElement(k);
  viewport.appendChild(cardElement);
}

// Renders the HTML block for Card index
function renderCardElement(idx) {
  const data = cardsData[idx];
  const entity = entitiesByName[data.name];
  if (!entity) return null;

  const typeClass = getTypeClass(entity.type);

  const card = document.createElement("section");
  card.className = "relation-card";
  card.id = `card-${idx}`;
  card.dataset.index = idx;

  let branchSelectorHtml = "";
  if (idx > 0 && data.candidates.length > 1) {
    branchSelectorHtml = `
      <div class="roam-navigator" onclick="event.stopPropagation()">
        <button class="roam-arrow-btn prev-branch-btn ${data.activeChoice === 0 ? 'disabled' : ''}" aria-label="上一个支路">&larr;</button>
        <span class="roam-path-indicator">支线 ${data.activeChoice + 1}/${data.candidates.length}</span>
        <button class="roam-arrow-btn next-branch-btn ${data.activeChoice === data.candidates.length - 1 ? 'disabled' : ''}" aria-label="下一个支路">&rarr;</button>
      </div>
    `;
  }

  card.innerHTML = `
    <span class="entity-type type-${typeClass} bg-type-${typeClass}">${entity.type}</span>
    <h2 class="entity-name type-${typeClass}" data-name="${entity.name}">${entity.name}</h2>
    ${branchSelectorHtml}
  `;

  // Name click event: Opens bottom sheet details
  card.querySelector(".entity-name").addEventListener("click", (e) => {
    e.stopPropagation();
    openDetailSheet(e.target.dataset.name);
  });

  // Bind Branch Switch Arrows Click Events
  bindArrowEvents(card, idx);

  return card;
}

// Bind Arrow Events helper
function bindArrowEvents(card, idx) {
  const data = cardsData[idx];
  const prevBtn = card.querySelector(".prev-branch-btn");
  const nextBtn = card.querySelector(".next-branch-btn");

  if (prevBtn) {
    prevBtn.onclick = (e) => {
      e.stopPropagation();
      switchBranch(idx, data.activeChoice - 1);
    };
  }
  if (nextBtn) {
    nextBtn.onclick = (e) => {
      e.stopPropagation();
      switchBranch(idx, data.activeChoice + 1);
    };
  }
}

// Updates Card elements in the DOM in-place to avoid dynamic height shifting and scroll snapping jumps
function updateCardDOM(idx) {
  const card = document.getElementById(`card-${idx}`);
  if (!card) return;

  const data = cardsData[idx];
  const entity = entitiesByName[data.name];
  if (!entity) return;

  const typeClass = getTypeClass(entity.type);

  // 1. Update entity type badge
  const badge = card.querySelector(".entity-type");
  if (badge) {
    badge.className = `entity-type type-${typeClass} bg-type-${typeClass}`;
    badge.textContent = entity.type;
  }

  // 2. Update entity name text and data-name
  const nameEl = card.querySelector(".entity-name");
  if (nameEl) {
    nameEl.className = `entity-name type-${typeClass}`;
    nameEl.dataset.name = entity.name;
    nameEl.textContent = entity.name;
  }

  // 3. Update branch navigator arrows and counter
  const navigator = card.querySelector(".roam-navigator");
  if (idx > 0 && data.candidates.length > 1) {
    if (navigator) {
      const indicator = navigator.querySelector(".roam-path-indicator");
      if (indicator) {
        indicator.textContent = `支线 ${data.activeChoice + 1}/${data.candidates.length}`;
      }
      
      const prevBtn = navigator.querySelector(".prev-branch-btn");
      if (prevBtn) {
        if (data.activeChoice === 0) {
          prevBtn.classList.add("disabled");
          prevBtn.onclick = null;
        } else {
          prevBtn.classList.remove("disabled");
          prevBtn.onclick = (e) => {
            e.stopPropagation();
            switchBranch(idx, data.activeChoice - 1);
          };
        }
      }
      
      const nextBtn = navigator.querySelector(".next-branch-btn");
      if (nextBtn) {
        if (data.activeChoice === data.candidates.length - 1) {
          nextBtn.classList.add("disabled");
          nextBtn.onclick = null;
        } else {
          nextBtn.classList.remove("disabled");
          nextBtn.onclick = (e) => {
            e.stopPropagation();
            switchBranch(idx, data.activeChoice + 1);
          };
        }
      }
    } else {
      // Create it if it wasn't there
      const roamNavigator = document.createElement("div");
      roamNavigator.className = "roam-navigator";
      roamNavigator.onclick = (e) => e.stopPropagation();
      roamNavigator.innerHTML = `
        <button class="roam-arrow-btn prev-branch-btn ${data.activeChoice === 0 ? 'disabled' : ''}" aria-label="上一个支路">&larr;</button>
        <span class="roam-path-indicator">支线 ${data.activeChoice + 1}/${data.candidates.length}</span>
        <button class="roam-arrow-btn next-branch-btn ${data.activeChoice === data.candidates.length - 1 ? 'disabled' : ''}" aria-label="下一个支路">&rarr;</button>
      `;
      card.appendChild(roamNavigator);
      bindArrowEvents(card, idx);
    }
  } else {
    // Remove if it exists but is no longer needed
    if (navigator) {
      navigator.remove();
    }
  }
}

// Swaps the active branch on card index k, modifying child nodes in place
function switchBranch(idx, newChoiceIdx) {
  const data = cardsData[idx];
  if (newChoiceIdx < 0 || newChoiceIdx >= data.candidates.length) return;

  // 1. Update the choice index and entity name on the current node
  data.activeChoice = newChoiceIdx;
  data.name = data.candidates[newChoiceIdx].name;

  // 2. Reflect the name change in-place inside the DOM
  updateCardDOM(idx);

  // 3. Re-calculate visited entities list for the active path
  visitedEntities.clear();
  for (let i = 0; i <= idx; i++) {
    visitedEntities.add(cardsData[i].name);
  }

  // 4. Update the pre-rendered child node (idx + 1) to link to the new name
  if (idx + 1 < cardsData.length) {
    const childData = cardsData[idx + 1];
    const grandparentName = cardsData[idx - 1].name;
    const newCandidates = getCandidatesForNode(data.name, grandparentName);
    
    if (newCandidates.length > 0) {
      childData.name = newCandidates[0].name;
      childData.candidates = newCandidates;
      childData.activeChoice = 0;
      
      // Update DOM for child node in-place
      updateCardDOM(idx + 1);
    }
  }

  // 5. Update central divider popup description instantly
  syncDividerRelationship();
}

/* ==========================================================================
   4. Scroll Snap Tracking & Pre-rendering
   ========================================================================== */
function handleScrollTracking() {
  handleScrollTips();

  if (cardHeight <= 0) updateDimensions();

  // Compute which card is currently aligned to the top half
  const index = Math.round(viewport.scrollTop / cardHeight);
  
  if (index !== currentTopIndex && index >= 0 && index < cardsData.length) {
    currentTopIndex = index;
    
    // Commit the newly centered node to the path history
    commitNodeToPathHistory(currentTopIndex + 1);

    // If bottom card is the last card in the path, pre-render the next one!
    if (currentTopIndex + 1 === cardsData.length - 1) {
      appendNextStep();
    }

    updateActiveCardsHighlight();
    syncDividerRelationship();
  }
}

// Adds node to visited list when it slides from bottom into top position
function commitNodeToPathHistory(index) {
  if (index < cardsData.length) {
    const name = cardsData[index].name;
    visitedEntities.add(name);
  }
}

// Highlights top and bottom card nodes and updates branch arrows visibility
function updateActiveCardsHighlight() {
  const cards = viewport.querySelectorAll(".relation-card");
  cards.forEach(card => {
    const idx = parseInt(card.dataset.index);
    card.classList.remove("is-top", "is-bottom");
    if (idx === currentTopIndex) {
      card.classList.add("is-top");
    } else if (idx === currentTopIndex + 1) {
      card.classList.add("is-bottom");
    }
  });
}

// Updates relationship details inside the HUD divider popup
function syncDividerRelationship() {
  const topCardData = cardsData[currentTopIndex];
  const bottomCardData = cardsData[currentTopIndex + 1];

  if (!topCardData || !bottomCardData) return;

  // Find the relationship between current top card and bottom card
  const activeCandidate = bottomCardData.candidates[bottomCardData.activeChoice];
  if (activeCandidate && activeCandidate.relationship) {
    const rel = activeCandidate.relationship;
    popupRelType.textContent = `【 ${rel.type} 】`;
    popupRelDesc.textContent = rel.description;
  } else {
    // Fallback if no relationship
    popupRelType.textContent = "【 稽联 】";
    popupRelDesc.textContent = `${topCardData.name} 与 ${bottomCardData.name} 存在历史稽联。`;
  }
}

/* ==========================================================================
   5. Divider Relationship Pop-up Controller
   ========================================================================== */
function openRelationPopup() {
  syncDividerRelationship();
  relationDetailPopup.classList.add("active");
}

function closeRelationPopup() {
  relationDetailPopup.classList.remove("active");
}

/* ==========================================================================
   6. Entity Detail Drawer (Bottom Sheet) Controller
   ========================================================================== */
function openDetailSheet(entityName) {
  const entity = entitiesByName[entityName];
  if (!entity) return;

  const typeClass = getTypeClass(entity.type);

  // Styling badge
  detailBadge.className = "entity-badge";
  detailBadge.classList.add(`type-${typeClass}`, `bg-type-${typeClass}`);
  detailBadge.textContent = entity.type;

  detailTitle.textContent = entity.name;

  // Render consolidated chapter descriptions
  detailDescList.innerHTML = entity.descriptions
    .map(desc => `
      <div class="desc-item">
        <div class="desc-chap-title">${desc.chapter}</div>
        <p class="desc-text">${desc.text}</p>
      </div>
    `)
    .join("");

  // Clean or append connections
  const rawRels = relationshipsByEntity[entityName] || [];
  
  let jumpButtonHtml = `
    <button id="roam-from-entity-btn" class="popup-close-btn" style="margin-top: 16px; border-color: var(--color-type-event); color: var(--color-type-event); width: 100%;">
      以此主体开始漫游 🧭
    </button>
  `;

  if (rawRels.length > 0) {
    detailConnections.innerHTML = rawRels
      .map(rel => {
        const otherName = (rel.source === entityName) ? rel.target : rel.source;
        return `
          <button class="conn-chip" data-target-name="${otherName}">
            <span>${otherName}</span>
            <span class="conn-type">${rel.type}</span>
          </button>
        `;
      })
      .join("") + jumpButtonHtml;

    // Click triggers inside drawer
    detailConnections.querySelectorAll(".conn-chip").forEach(chip => {
      chip.addEventListener("click", (e) => {
        const targetName = e.currentTarget.dataset.targetName;
        openDetailSheet(targetName);
      });
    });
  } else {
    detailConnections.innerHTML = `<p class="empty-text">无其他关联。</p>` + jumpButtonHtml;
  }

  // Bind the special start roaming button
  document.getElementById("roam-from-entity-btn").addEventListener("click", () => {
    closeDetailSheet();
    startRoaming(entityName);
  });

  // Open Drawer UI
  detailOverlay.classList.add("active");
  detailSheet.classList.add("active");
}

function closeDetailSheet() {
  detailOverlay.classList.remove("active");
  detailSheet.classList.remove("active");
}

/* ==========================================================================
   7. Subject Index Drawer Controller
   ========================================================================== */
function openIndexDrawer() {
  searchInput.value = "";
  filterChips.forEach(c => c.classList.remove("active"));
  document.querySelector('.filter-chip[data-category="all"]').classList.add("active");
  
  filterIndex();

  indexOverlay.classList.add("active");
  indexDrawer.classList.add("active");
}

function closeIndexDrawer() {
  indexOverlay.classList.remove("active");
  indexDrawer.classList.remove("active");
}

function renderIndexList() {
  const sortedEntities = [...kgData.entities].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  
  indexList.innerHTML = sortedEntities
    .map(e => {
      const typeClass = getTypeClass(e.type);
      return `
        <li class="index-item" data-name="${e.name}" data-category="${e.type}">
          <span class="index-item-name">${e.name}</span>
          <span class="index-item-type type-${typeClass} bg-type-${typeClass}">${e.type}</span>
        </li>
      `;
    })
    .join("");

  indexList.querySelectorAll(".index-item").forEach(item => {
    item.addEventListener("click", () => {
      closeIndexDrawer();
      openDetailSheet(item.dataset.name);
    });
  });
}

function filterIndex() {
  const query = searchInput.value.toLowerCase().trim();
  const selectedChip = document.querySelector(".filter-chip.active");
  const selectedCategory = selectedChip ? selectedChip.dataset.category : "all";

  const items = indexList.querySelectorAll(".index-item");
  items.forEach(item => {
    const name = item.dataset.name.toLowerCase();
    const category = item.dataset.category;
    const entity = entitiesByName[item.dataset.name];
    
    let matchesQuery = name.includes(query);
    if (!matchesQuery && entity) {
      matchesQuery = entity.descriptions.some(d => d.text.toLowerCase().includes(query));
    }

    const matchesCategory = (selectedCategory === "all" || category === selectedCategory);

    if (matchesQuery && matchesCategory) {
      item.style.display = "flex";
    } else {
      item.style.display = "none";
    }
  });
}

// Start app once DOM is ready
document.addEventListener("DOMContentLoaded", init);
