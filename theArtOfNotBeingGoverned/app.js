document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('card-container');
    const subFilters = document.getElementById('sub-filters');
    const filterBtns = document.querySelectorAll('.filter-btn');

    let currentFilterType = 'chapter'; // 'chapter', 'theme', or 'random'
    let currentFilterValue = '全部';

    // 初始化：渲染全部分类按钮和卡片
    updateSubFilters();
    renderCards();

    // 顶级筛选切换 (章节 vs 主题 vs 自由观点)
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilterType = btn.dataset.type;
            
            if (currentFilterType === 'random') {
                currentFilterValue = '随机';
                subFilters.style.display = 'none'; // 随机模式不需要子筛选
            } else {
                currentFilterValue = '全部';
                subFilters.style.display = 'flex';
            }
            
            updateSubFilters();
            renderCards();
        });
    });

    // 更新子筛选按钮
    function updateSubFilters() {
        subFilters.innerHTML = '';
        if (currentFilterType === 'random') return;

        const options = new Set(['全部']);
        
        cardsData.forEach(card => {
            if (currentFilterType === 'chapter') {
                options.add(card.chapter);
            } else if (currentFilterType === 'theme') {
                card.themes.forEach(t => options.add(t));
            }
        });

        Array.from(options).forEach(opt => {
            const btn = document.createElement('button');
            btn.className = `opt-btn ${currentFilterValue === opt ? 'selected' : ''}`;
            btn.textContent = opt;
            btn.addEventListener('click', () => {
                document.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                currentFilterValue = opt;
                renderCards();
            });
            subFilters.appendChild(btn);
        });
    }

    // 渲染卡片
    function renderCards() {
        container.innerHTML = '';
        
        let filteredData = [];

        if (currentFilterType === 'random') {
            // 随机洗牌逻辑
            filteredData = [...cardsData]
                .sort(() => Math.random() - 0.5)
                .slice(0, 6);
        } else {
            filteredData = cardsData.filter(card => {
                if (currentFilterValue === '全部') return true;
                if (currentFilterType === 'chapter') {
                    return card.chapter === currentFilterValue;
                } else {
                    return card.themes.includes(currentFilterValue);
                }
            });
        }

        filteredData.forEach((card, index) => {
            const cardWrapper = document.createElement('div');
            cardWrapper.className = 'card-wrapper';
            
            // 使用延迟加载动画
            cardWrapper.style.animation = `fadeIn 0.5s ease forwards ${index * 0.05}s`;
            cardWrapper.style.opacity = '0';

            const quotesHtml = card.quotes.map(q => `<p>${q}</p>`).join('');
            const tagsHtml = card.themes.map(t => `<span class="tag">${t}</span>`).join('');

            cardWrapper.innerHTML = `
                <div class="card" onclick="this.classList.toggle('flipped')">
                    <div class="card-face card-front">
                        <div class="card-chapter">${card.chapter}</div>
                        <div class="card-title">${card.title}</div>
                        <div class="card-opinion">${card.opinion}</div>
                        <div class="card-hint">点击翻转查看原文 →</div>
                    </div>
                    <div class="card-face card-back">
                        <h4>原文支持</h4>
                        <div class="card-quotes">
                            ${quotesHtml}
                        </div>
                        <div class="card-themes">
                            ${tagsHtml}
                        </div>
                    </div>
                </div>
            `;
            container.appendChild(cardWrapper);
        });
    }
});

// 添加淡入动画
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
    }
`;
document.head.appendChild(style);
