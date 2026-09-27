const btnHome = document.getElementById('navHome');
const btnSearch = document.getElementById('navSearch');
const btnFav = document.getElementById('navFav');

const pageHome = document.getElementById('homePage');
const pageSearch = document.getElementById('searchPage');
const pageFav = document.getElementById('favoritesPage');
const API_BASE_URL = window.location.port === '3000'
    ? ''
    : `${window.location.protocol}//${window.location.hostname || 'localhost'}:3000`;

function getApiUrl(path) {
    return `${API_BASE_URL}${path}`;
}

async function fetchApiJson(path) {
    const response = await fetch(getApiUrl(path));
    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
        const body = await response.text();
        if (body.trimStart().startsWith('<')) {
            throw new Error('เซิร์ฟเวอร์พอร์ต 3000 ยังไม่รู้จัก API นี้ (อาจกำลังรันโค้ดเก่า) กรุณาหยุด Node แล้วเริ่มใหม่ด้วยคำสั่ง node server.js');
        }
        throw new Error('เซิร์ฟเวอร์ส่งข้อมูลกลับมาไม่ใช่ JSON');
    }

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || `API ตอบกลับด้วยสถานะ ${response.status}`);
    }
    return data;
}

// ฟังก์ชันควบคุมการกดสลับหน้าจอหลักด้านล่าง
function switchPage(activePage, activeBtn) {
    pageHome.classList.add('hidden');
    pageSearch.classList.add('hidden');
    pageFav.classList.add('hidden');

    btnHome.classList.remove('active');
    btnSearch.classList.remove('active');
    btnFav.classList.remove('active');

    activePage.classList.remove('hidden');
    activeBtn.classList.add('active');
    window.scrollTo(0, 0);
}

function getMangaCoverUrl(manga) {
    const coverRelation = (manga.relationships || []).find(rel => rel.type === "cover_art");
    const fileName = coverRelation?.attributes?.fileName;
    if (fileName && manga.id) {
        return getApiUrl(`/api/cover/${manga.id}/${fileName}`);
    }
    return "https://placehold.co";
}

function getMangaTitle(manga) {
    const titles = manga?.attributes?.title || {};
    return titles.en || titles.th || Object.values(titles)[0] || 'Manga Title';
}

const bannerManga = [
    { title: 'Haikyu!!', search: 'Haikyu!!', aliases: ['Haikyu!!', 'Haikyuu!!'], image: 'banner1.png' },
    { title: 'SAKAMOTO DAYS', search: 'Sakamoto Days', aliases: ['SAKAMOTO DAYS'], image: 'banner2.png' },
    { title: 'Golden Kamuy', search: 'Golden Kamuy', aliases: ['Golden Kamuy'], image: 'banner3.png' },
    { title: 'ดาบพิฆาตอสูร', search: 'Kimetsu no Yaiba', aliases: ['Demon Slayer: Kimetsu no Yaiba', 'Kimetsu no Yaiba'], image: 'banner4.png' },
    { title: 'Dr. STONE', search: 'Dr. Stone', aliases: ['Dr. Stone'], image: 'banner5.png' }
];

let activeBannerRequest = 0;
const LIBRARY_STORAGE_KEY = 'nekoread.library.v1';
let mangaLibrary = readMangaLibrary();
let activeModalManga = null;
let activeModalCoverUrl = '';

function readMangaLibrary() {
    try {
        const savedLibrary = JSON.parse(localStorage.getItem(LIBRARY_STORAGE_KEY) || '{}');
        return {
            following: Array.isArray(savedLibrary.following) ? savedLibrary.following : [],
            history: Array.isArray(savedLibrary.history) ? savedLibrary.history : []
        };
    } catch {
        return { following: [], history: [] };
    }
}

function saveMangaLibrary() {
    try {
        localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(mangaLibrary));
    } catch (error) {
        console.error('บันทึกรายการมังงะไม่สำเร็จ:', error);
    }
}

function createLibraryRecord(manga, coverUrl) {
    const attributes = manga?.attributes || {};
    const description = attributes.description || {};
    const title = getMangaTitle(manga);

    return {
        id: String(manga?.id || `local-${normalizeMangaTitle(title)}`),
        coverUrl,
        attributes: {
            title: { en: title },
            altTitles: attributes.altTitles || [],
            description: {
                en: description.en || description.th || Object.values(description)[0] || ''
            },
            status: attributes.status || '',
            year: attributes.year || '',
            tags: (attributes.tags || []).map(tag => ({
                attributes: { name: tag.attributes?.name || {} }
            }))
        }
    };
}

function recordMangaHistory(manga, coverUrl, replaceId = '') {
    const record = createLibraryRecord(manga, coverUrl);
    if (replaceId && replaceId !== record.id) {
        mangaLibrary.history = mangaLibrary.history.filter(item => item.id !== replaceId);
        mangaLibrary.following = mangaLibrary.following.map(item => item.id === replaceId ? record : item);
    }
    mangaLibrary.history = [record, ...mangaLibrary.history.filter(item => item.id !== record.id)].slice(0, 50);
    saveMangaLibrary();
    renderMangaLibrary();
    return record;
}

function isMangaFollowed(manga) {
    const id = String(manga?.id || `local-${normalizeMangaTitle(getMangaTitle(manga))}`);
    return mangaLibrary.following.some(item => item.id === id);
}

function updateModalFollowButton() {
    const button = document.getElementById('modalFollowButton');
    if (!button || !activeModalManga) return;
    const followed = isMangaFollowed(activeModalManga);
    button.textContent = followed ? 'เลิกติดตาม' : 'เพิ่มรายการที่ติดตาม';
    button.setAttribute('aria-pressed', String(followed));
}

function toggleMangaFollow(manga, coverUrl) {
    if (!manga) return;
    const record = createLibraryRecord(manga, coverUrl || getMangaCoverUrl(manga));
    const alreadyFollowing = mangaLibrary.following.some(item => item.id === record.id);
    mangaLibrary.following = alreadyFollowing
        ? mangaLibrary.following.filter(item => item.id !== record.id)
        : [record, ...mangaLibrary.following];
    saveMangaLibrary();
    updateModalFollowButton();
    renderMangaLibrary();
}

function renderMangaLibrary() {
    const container = document.getElementById('favListContainer');
    if (!container) return;

    const activeTab = document.querySelector('.fav-tab-btn.active')?.dataset.libraryTab || 'history';
    const items = activeTab === 'following' ? mangaLibrary.following : mangaLibrary.history;
    container.replaceChildren();

    if (!items.length) {
        const emptyState = document.createElement('p');
        emptyState.className = 'library-empty-state';
        emptyState.textContent = activeTab === 'following'
            ? 'ยังไม่มีมังงะที่ติดตาม'
            : 'ยังไม่มีประวัติการเปิดดูมังงะ';
        container.append(emptyState);
        return;
    }

    items.forEach(record => {
        const card = document.createElement('article');
        card.className = 'library-card';

        const openButton = document.createElement('button');
        openButton.className = 'library-card-open';
        openButton.type = 'button';
        openButton.addEventListener('click', () => openMangaModal(record, record.coverUrl));

        const cover = document.createElement('img');
        cover.src = record.coverUrl;
        cover.alt = `ปก ${getMangaTitle(record)}`;
        cover.loading = 'lazy';

        const title = document.createElement('span');
        title.className = 'library-card-title';
        title.textContent = getMangaTitle(record);
        openButton.append(cover, title);

        const action = document.createElement('button');
        action.className = 'library-card-action';
        action.type = 'button';
        if (activeTab === 'history') {
            action.textContent = 'ลบประวัติ';
            action.setAttribute('aria-label', `ลบประวัติ ${getMangaTitle(record)}`);
            action.addEventListener('click', () => {
                mangaLibrary.history = mangaLibrary.history.filter(item => item.id !== record.id);
                saveMangaLibrary();
                renderMangaLibrary();
            });
        } else {
            action.textContent = 'เลิกติดตาม';
            action.setAttribute('aria-label', `เลิกติดตาม ${getMangaTitle(record)}`);
            action.addEventListener('click', () => toggleMangaFollow(record, record.coverUrl));
        }

        card.append(openButton, action);
        container.append(card);
    });
}

function bindMangaCards(container, mangaItems, coverUrls = []) {
    if (!container) return;

    Array.from(container.children).forEach((card, index) => {
        const manga = mangaItems[index];
        if (!manga) return;

        const openDetails = () => {
            activeBannerRequest += 1;
            openMangaModal(manga, coverUrls[index] || getMangaCoverUrl(manga));
        };
        card.setAttribute('role', 'button');
        card.tabIndex = 0;
        card.addEventListener('click', openDetails);
        card.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openDetails();
            }
        });
    });
}

function normalizeMangaTitle(title) {
    return String(title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function openBannerManga(entry) {
    const requestId = ++activeBannerRequest;
    const fallbackManga = {
        id: `banner-${normalizeMangaTitle(entry.title)}`,
        attributes: {
            title: { en: entry.title },
            description: { en: 'กำลังโหลดรายละเอียด...' }
        }
    };
    openMangaModal(fallbackManga, entry.image, '', true);

    try {
        const data = await fetchApiJson(`/api/search?${new URLSearchParams({ q: entry.search })}`);
        const expectedTitles = entry.aliases.map(normalizeMangaTitle);
        const manga = (data.data || []).find(item => {
            const titles = [
                ...Object.values(item.attributes?.title || {}),
                ...(item.attributes?.altTitles || []).flatMap(title => Object.values(title))
            ];
            return titles.some(title => expectedTitles.includes(normalizeMangaTitle(title)));
        });

        if (requestId !== activeBannerRequest || !manga || document.getElementById('mangaModal')?.hidden) {
            if (!manga && requestId === activeBannerRequest) {
                document.getElementById('modalDescription').textContent = 'ยังไม่พบรายละเอียดเรื่องนี้ใน MangaDex';
            }
            return;
        }

        openMangaModal({
            ...manga,
            attributes: { ...manga.attributes, title: { en: entry.title } }
        }, entry.image, fallbackManga.id, true);
    } catch (error) {
        if (requestId === activeBannerRequest) {
            document.getElementById('modalDescription').textContent = 'โหลดรายละเอียดเพิ่มเติมไม่สำเร็จ';
            console.error('โหลดข้อมูลแบนเนอร์ไม่สำเร็จ:', error);
        }
    }
}

function bindLoopingNextButton(scrollContainer, button) {
    if (!scrollContainer || !button) return;

    let currentIndex = 0;
    let reachedEnd = false;
    button.removeAttribute('onclick');
    button.onclick = function() {
        const itemCount = scrollContainer.children.length;
        if (!itemCount) return;

        const maxScrollLeft = scrollContainer.scrollWidth - scrollContainer.clientWidth;
        if (reachedEnd || maxScrollLeft <= 0) {
            currentIndex = 0;
            reachedEnd = false;
            scrollContainer.scrollTo({ left: 0, behavior: 'smooth' });
            return;
        }

        currentIndex = Math.min(currentIndex + 1, itemCount - 1);
        const targetCard = scrollContainer.children[currentIndex];
        const targetLeft = Math.min(
            scrollContainer.scrollLeft + targetCard.getBoundingClientRect().left - scrollContainer.getBoundingClientRect().left,
            maxScrollLeft
        );
        reachedEnd = currentIndex === itemCount - 1 || targetLeft >= maxScrollLeft - 1;
        scrollContainer.scrollTo({
            left: reachedEnd ? maxScrollLeft : targetLeft,
            behavior: 'smooth'
        });
    };
}

async function fetchSpecialManga() {
    try {
        const bannerSlider = document.getElementById('bannerSlider');
        const specialGrid = document.getElementById('specialGrid');
        const data = await fetchApiJson('/api/recommend');
        if (!Array.isArray(data.data)) {
            throw new Error(data.error || 'รูปแบบข้อมูลจาก API ไม่ถูกต้อง');
        }
        
        const allManga = data.data;
        if (bannerSlider) {
            bannerSlider.innerHTML = bannerManga.map(entry => {
                return `
                    <div class="banner-slide" style="cursor: pointer;">
                        <img src="${entry.image}" alt="${entry.title}" style="width: 100%; height: 100%; object-fit: cover; object-position: center;">
                    </div>
                `;
            }).join('');

            Array.from(bannerSlider.children).forEach((card, index) => {
                const entry = bannerManga[index];
                const openDetails = () => openBannerManga(entry);
                card.setAttribute('role', 'button');
                card.tabIndex = 0;
                card.addEventListener('click', openDetails);
                card.addEventListener('keydown', event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openDetails();
                    }
                });
            });
        }

        if (specialGrid && allManga.length >= 17) {
            const specialItems = allManga.slice(5, 17);
            specialGrid.innerHTML = specialItems.map(manga => {
                const coverUrl = getMangaCoverUrl(manga);
                const title = getMangaTitle(manga);
                return `
                    <div class="manga-card" style="cursor: pointer;">
                        <img src="${coverUrl}" alt="หน้าปกมังงะ">
                        <div class="manga-title" style="font-size: 0.85rem; margin-top: 6px; text-align: center; 
                        color: #ffffff; font-weight: bold; white-space: nowrap; overflow: 
                        hidden; text-overflow: ellipsis;">${title}</div>
                    </div>
                `;
            }).join('');
            bindMangaCards(specialGrid, specialItems);
        }
        
        const weeklyFeaturedScroll = document.getElementById('weeklyFeaturedScroll');
        const btnWeeklyNext = document.getElementById('scrollWeeklyNext');
        
        if (weeklyFeaturedScroll && allManga.length >= 27) {
            const weeklyItems = allManga.slice(17, 27);
            weeklyFeaturedScroll.innerHTML = weeklyItems.map((manga, index) => {
                const coverUrl = getMangaCoverUrl(manga);
                return `
                    <div class="rank-loop-card">
                        <img src="${coverUrl}" class="rank-loop-cover" alt="ปกมังงะ">
                        <div class="rank-loop-number">${index + 1}</div>
                    </div>
                `;
            }).join('');
            bindMangaCards(weeklyFeaturedScroll, weeklyItems);

            if (btnWeeklyNext) {
                btnWeeklyNext.removeAttribute('onclick');
                let currentIndex = 0;
                let reachedEnd = false;
                
                btnWeeklyNext.onclick = function() {
                    if (reachedEnd) {
                        currentIndex = 0;
                        reachedEnd = false;
                        weeklyFeaturedScroll.scrollTo({ left: 0, behavior: 'smooth' });
                        return;
                    }

                    const nextIndex = Math.min(currentIndex + 1, weeklyItems.length - 1);
                    const targetCard = weeklyFeaturedScroll.children[nextIndex];
                    const maxScrollLeft = weeklyFeaturedScroll.scrollWidth - weeklyFeaturedScroll.clientWidth;

                    if (targetCard) {
                        currentIndex = nextIndex;
                        reachedEnd = targetCard.offsetLeft >= maxScrollLeft;
                        weeklyFeaturedScroll.scrollTo({
                            left: reachedEnd ? maxScrollLeft : targetCard.offsetLeft,
                            behavior: 'smooth'
                        });
                    } else {
                        currentIndex = 0;
                        reachedEnd = false;
                    }
                };
            }

        } 

        const newReleasesScroll = document.getElementById('newReleasesScroll');
        if (newReleasesScroll && allManga.length >= 37) {
            const newItems = allManga.slice(27, 37);
            newReleasesScroll.innerHTML = newItems.map(manga => {
                const coverUrl = getMangaCoverUrl(manga);
                return `
                    <div class="new-release-card">
                        <img src="${coverUrl}" alt="ปกมังงะเรื่องใหม่" class="new-release-cover">
                    </div>
                `;
            }).join('');
            bindMangaCards(newReleasesScroll, newItems);
        }

        const trendingScroll = document.getElementById('trendingScroll');
        if (trendingScroll && allManga.length >= 47) {
            const trendItems = allManga.slice(37, 47); 
            
            trendingScroll.innerHTML = trendItems.map(manga => {
                const coverUrl = getMangaCoverUrl(manga); 
                const title = getMangaTitle(manga);
                const description = manga.attributes.description.en || Object.values(manga.attributes.description)[0] || "ไม่มีข้อมูลเรื่องย่อของมังงะเรื่องนี้...";
                
                return `
                    <div class="trend-horizontal-card">
                        <img src="${coverUrl}" alt="${title}" class="trend-cover">
                        
                        <div class="trend-info">
                            <div style="font-size: 1rem; font-weight: bold; 
                            color: #ffffff; white-space: nowrap; overflow: 
                            hidden; text-overflow: ellipsis; margin-bottom: 4px;">${title}</div>
                                                        
                            <div style="font-size: 0.7rem; color: #38bdf8; 
                            font-weight: 500; margin-bottom: 4px; text-transform: 
                            uppercase;">Genre : ${manga.type} | ${manga.attributes.status}</div>

                            <div style="font-size: 0.75rem; color: #94a3b8; 
                            display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; 
                            overflow: hidden; line-height: 1.3;">${description}</div>
                        </div>
                    </div>
                `;
            }).join('');
            bindMangaCards(trendingScroll, trendItems);
        }

        const comingSoonScroll = document.getElementById('comingSoonScroll');
        if (comingSoonScroll && allManga.length >= 52) {
            const soonItems = allManga.slice(47, 57); 
            
            comingSoonScroll.innerHTML = soonItems.map(manga => {
                const coverUrl = getMangaCoverUrl(manga); 
                return `
                    <div class="coming-soon-card">
                        <img src="${coverUrl}" alt="ปกมังงะเร็วๆนี้" class="coming-soon-cover">
                    </div>
                `;
            }).join('');
            bindMangaCards(comingSoonScroll, soonItems);
        }

        const btnNewNext = document.getElementById('scrollNewNext'); 
        if (newReleasesScroll && btnNewNext) {
            btnNewNext.removeAttribute('onclick'); 
            let currentNewStep = 0; 
            
            btnNewNext.onclick = function() {
                currentNewStep++; 
                if (currentNewStep >= 5) {
                    currentNewStep = 0; 
                    newReleasesScroll.scrollTo({ left: 0, behavior: 'smooth' }); 
                } else {
                    newReleasesScroll.scrollBy({ left: 390, behavior: 'smooth' });
                }
            };
        }

        const btnTrendNext = document.getElementById('scrollTrendNext'); 
        if (trendingScroll && btnTrendNext) {
            btnTrendNext.removeAttribute('onclick'); 
            let currentTrendStep = 0; 
            
            btnTrendNext.onclick = function() {
                currentTrendStep++; 
                if (currentTrendStep >= 5) {
                    currentTrendStep = 0; 
                    trendingScroll.scrollTo({ left: 0, behavior: 'smooth' }); 
                } else {
                    trendingScroll.scrollBy({ left: 590, behavior: 'smooth' });
                }
            };
        }
        
        const btnComingNext = document.getElementById('scrollComingNext'); 
        
        if (comingSoonScroll && btnComingNext) {
            btnComingNext.removeAttribute('onclick'); 
            let currentComingStep = 0; 
            
            btnComingNext.onclick = function() {
                currentComingStep++; 
                if (currentComingStep >= 3) {
                    currentComingStep = 0; 
                    comingSoonScroll.scrollTo({ left: 0, behavior: 'smooth' }); 
                } else {
                    comingSoonScroll.scrollBy({ left: 360, behavior: 'smooth' });
                }
            };
        }

        bindLoopingNextButton(weeklyFeaturedScroll, btnWeeklyNext);
        bindLoopingNextButton(newReleasesScroll, document.getElementById('scrollNewNext'));
        bindLoopingNextButton(trendingScroll, document.getElementById('scrollTrendNext'));
        bindLoopingNextButton(comingSoonScroll, document.getElementById('scrollComingNext'));

    } catch (error) {
        console.error("เกิดข้อผิดพลาดในการโหลดรูปมังงะจริง:", error);
        const specialGrid = document.getElementById('specialGrid');
        if (specialGrid) {
            specialGrid.innerHTML = `<div class="manga-placeholder-card">โหลดข้อมูลไม่สำเร็จ: ${error.message}</div>`;
        }
    }
}

btnHome.addEventListener('click', () => switchPage(pageHome, btnHome));
btnSearch.addEventListener('click', () => switchPage(pageSearch, btnSearch));
btnFav.addEventListener('click', () => {
    switchPage(pageFav, btnFav);
    renderMangaLibrary();
});

const favTabs = document.querySelectorAll('.fav-tab-btn');
favTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        favTabs.forEach(t => {
            t.classList.remove('active');
            t.setAttribute('aria-pressed', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-pressed', 'true');
        renderMangaLibrary();
    });
});

fetchSpecialManga();

async function loadSearchGenres() {
    const genreSelect = document.getElementById('genreSelect');
    if (!genreSelect) return;

    const data = await fetchApiJson('/api/genres');
    if (!Array.isArray(data.data)) {
        throw new Error(data.error || 'โหลดประเภทมังงะไม่สำเร็จ');
    }

    const genres = data.data
        .filter(tag => tag.attributes.group === 'genre')
        .sort((first, second) => (first.attributes.name.en || '').localeCompare(second.attributes.name.en || ''));

    genreSelect.replaceChildren(new Option('ทุกประเภท', ''));
    genres.forEach(tag => {
        const name = tag.attributes.name.en || Object.values(tag.attributes.name)[0] || 'ประเภทอื่น';
        genreSelect.add(new Option(name, tag.id));
    });
}

async function loadSearchManga({ popular = false } = {}) {
    const searchInput = document.getElementById('searchInput');
    const genreSelect = document.getElementById('genreSelect');
    const searchResults = document.getElementById('trendingSearchScroll');
    const status = document.getElementById('searchStatus');
    const title = document.getElementById('searchResultsTitle');
    if (!searchResults || !status) return;

    const query = searchInput?.value.trim() || '';
    const genre = genreSelect?.value || '';
    const endpoint = popular || (!query && !genre)
        ? '/api/popular'
        : `/api/search?${new URLSearchParams({ q: query, genre })}`;

    if (title) title.textContent = endpoint === '/api/popular' ? 'มังงะยอดนิยม' : 'ผลการค้นหา';
    status.textContent = 'กำลังโหลด...';
    searchResults.replaceChildren();

    try {
        const data = await fetchApiJson(endpoint);
        if (!Array.isArray(data.data)) {
            throw new Error(data.error || 'ค้นหามังงะไม่สำเร็จ');
        }

        if (data.data.length === 0) {
            status.textContent = 'ไม่พบมังงะที่ตรงกับการค้นหา';
            return;
        }

        data.data.forEach(manga => {
            const mangaTitle = getMangaTitle(manga);
            const card = document.createElement('article');
            card.className = 'search-result-card';

            const cover = document.createElement('img');
            cover.src = getMangaCoverUrl(manga);
            cover.alt = mangaTitle;
            cover.loading = 'lazy';

            const label = document.createElement('span');
            label.className = 'search-result-title';
            label.textContent = mangaTitle;

            card.append(cover, label);
            searchResults.append(card);
        });

        bindMangaCards(searchResults, data.data);
        status.textContent = `${data.data.length} เรื่อง`;
    } catch (error) {
        status.textContent = error.message;
        console.error('เกิดข้อผิดพลาดในการค้นหามังงะ:', error);
    }
}

function setupSearchPage() {
    const searchInput = document.getElementById('searchInput');
    const genreSelect = document.getElementById('genreSelect');
    let searchTimer;

    searchInput?.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => loadSearchManga(), 350);
    });
    genreSelect?.addEventListener('change', () => loadSearchManga());

    loadSearchGenres()
        .catch(error => console.error('เกิดข้อผิดพลาดในการโหลดประเภทมังงะ:', error))
        .finally(() => loadSearchManga({ popular: true }));
}

setupSearchPage();

function openMangaModal(manga, coverUrl = getMangaCoverUrl(manga), replaceHistoryId = '', isBanner = false) {
    const modal = document.getElementById('mangaModal');
    const modalCover = document.getElementById('modalCover');
    const modalTitle = document.getElementById('modalTitle');
    const modalAltTitle = document.getElementById('modalAltTitle');
    const modalMeta = document.getElementById('modalMeta');
    const modalDescription = document.getElementById('modalDescription');
    const modalTags = document.getElementById('modalTags');
    const attributes = manga?.attributes || {};

    if (modal && modalCover && modalTitle) {
        modal.querySelector('.manga-modal-content')?.classList.toggle('is-banner-detail', isBanner);
        activeModalManga = manga;
        activeModalCoverUrl = coverUrl;
        recordMangaHistory(manga, coverUrl, replaceHistoryId);
        modalCover.src = coverUrl;
        modalTitle.textContent = getMangaTitle(manga);
        modalAltTitle.textContent = (attributes.altTitles || []).flatMap(title => Object.values(title))[0] || '';
        modalMeta.textContent = [attributes.status, attributes.year].filter(Boolean).join(' · ');
        modalDescription.textContent = attributes.description?.en
            || attributes.description?.th
            || Object.values(attributes.description || {})[0]
            || 'ยังไม่มีเรื่องย่อ';
        modalTags.replaceChildren();

        (attributes.tags || []).forEach(tag => {
            const tagName = tag.attributes?.name?.en || Object.values(tag.attributes?.name || {})[0];
            if (!tagName) return;
            const tagElement = document.createElement('span');
            tagElement.className = 'manga-modal-tag';
            tagElement.textContent = tagName;
            modalTags.append(tagElement);
        });

        updateModalFollowButton();
        modal.hidden = false;
        document.body.classList.add('modal-open');
        document.getElementById('mangaModalClose')?.focus();
    }
}

document.getElementById('modalFollowButton')?.addEventListener('click', () => {
    toggleMangaFollow(activeModalManga, activeModalCoverUrl);
});

function closeMangaModal() {
    activeBannerRequest += 1;
    const modal = document.getElementById('mangaModal');
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    activeModalManga = null;
    activeModalCoverUrl = '';
}

document.getElementById('mangaModalClose')?.addEventListener('click', closeMangaModal);
document.getElementById('mangaModal')?.addEventListener('click', event => {
    if (event.target.id === 'mangaModal') closeMangaModal();
});
document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMangaModal();
});
