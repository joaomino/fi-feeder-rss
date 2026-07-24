document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('add-form');
  const input = document.getElementById('feed-url');
  const container = document.getElementById('feed-container');
  const pageTitle = document.getElementById('page-title');

  // Ajusta o layout para quando estiver na Página Inicial
  if (!chrome.action) {
    document.body.style.width = '100vw';
    document.body.style.maxWidth = '1200px';
    document.body.style.margin = '0 auto';
    pageTitle.style.display = 'block';
  }

  // Carrega feeds salvos
  loadFeeds();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = input.value.trim();
    if (!url) return;

    chrome.storage.sync.get({ feeds: [] }, (data) => {
      // Verifica se a URL já existe (em url ou url_original)
      if (data.feeds.some(f => f.url === url || f.url_original === url)) {
        alert('Este feed já foi adicionado!');
        return;
      }
      
      const newFeed = { url_original: url, url: url, name: '' };
      const updatedFeeds = [...data.feeds, newFeed];
      
      chrome.storage.sync.set({ feeds: updatedFeeds }, () => {
        input.value = '';
        loadFeeds();
      });
    });
  });

  async function loadFeeds() {
    container.innerHTML = '<div class="status">Carregando...</div>';
    
    chrome.storage.sync.get({ feeds: [] }, async (data) => {
      if (data.feeds.length === 0) {
        container.innerHTML = '<div class="status">Nenhum feed cadastrado. Cole uma URL acima!</div>';
        return;
      }

      container.innerHTML = '';
      for (const feed of data.feeds) {
        await fetchAndRenderFeed(feed);
      }
    });
  }

  async function fetchAndRenderFeed(feed) {
    try {
      const res = await fetch(feed.url_original);
      const text = await res.text();
      
      const parser = new DOMParser();
      const xml = parser.parseFromString(text, 'text/xml');

      const channelTitle = xml.querySelector('channel > title, feed > title')?.textContent || feed.url_original;
      const displayName = feed.name || channelTitle; // Use o nome personalizado se houver
      
      // ALTERADO: Pega as 10 últimas notícias de cada feed
      const items = Array.from(xml.querySelectorAll('item, entry')).slice(0, 10); 

      // Cabeçalho do Feed com nome e botões
      const header = document.createElement('div');
      header.className = 'feed-header';
      header.innerHTML = `
        <div class="feed-title-wrapper">
          <span class="feed-title" id="title-${feed.url_original}">${escapeHtml(displayName)}</span>
          <button class="btn-icon" data-url="${feed.url_original}">✎</button>
          <div class="rename-container" id="rename-container-${feed.url_original}">
            <input type="text" class="rename-input" value="${escapeHtml(displayName)}">
            <button class="btn-ok">OK</button>
          </div>
        </div>
        <button class="btn-icon btn-remove" data-url="${feed.url_original}">remover</button>
      `;
      
      // Lógica de renomear
      const titleSpan = header.querySelector(`#title-${feed.url_original}`);
      const editBtn = header.querySelector('.btn-icon:not(.btn-remove)');
      const renameContainer = header.querySelector(`#rename-container-${feed.url_original}`);
      const renameInput = renameContainer.querySelector('.rename-input');
      const okBtn = renameContainer.querySelector('.btn-ok');

      editBtn.addEventListener('click', () => {
        titleSpan.style.display = 'none';
        editBtn.style.display = 'none';
        renameContainer.style.display = 'flex';
        renameInput.focus();
      });

      okBtn.addEventListener('click', () => saveNewName(feed.url_original, renameInput.value));

      header.querySelector('.btn-remove').addEventListener('click', () => removeFeed(feed.url_original));
      container.appendChild(header);

      // Renderiza os artigos
      items.forEach(item => {
        const title = item.querySelector('title')?.textContent || 'Sem título';
        const link = item.querySelector('link')?.textContent || item.querySelector('link')?.getAttribute('href') || '#';
        const pubDate = item.querySelector('pubDate, updated')?.textContent || '';

        const itemEl = document.createElement('a');
        itemEl.className = 'item';
        itemEl.href = link;
        itemEl.target = '_blank';
        itemEl.rel = 'noopener noreferrer';

        const formattedDate = pubDate ? new Date(pubDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '';

        itemEl.innerHTML = `
          <div class="item-title">${escapeHtml(title)}</div>
          ${formattedDate ? `<div class="item-date">${formattedDate}</div>` : ''}
        `;

        container.appendChild(itemEl);
      });

    } catch (err) {
      // ... (erro permanece o mesmo)
    }
  }

  function saveNewName(urlOriginal, newName) {
    chrome.storage.sync.get({ feeds: [] }, (data) => {
      const updatedFeeds = data.feeds.map(feed => {
        if (feed.url_original === urlOriginal) {
          return { ...feed, name: newName };
        }
        return feed;
      });
      chrome.storage.sync.set({ feeds: updatedFeeds }, () => {
        loadFeeds();
      });
    });
  }

  function removeFeed(urlToRemove) {
    chrome.storage.sync.get({ feeds: [] }, (data) => {
      const updatedFeeds = data.feeds.filter(feed => feed.url_original !== urlToRemove);
      chrome.storage.sync.set({ feeds: updatedFeeds }, () => {
        loadFeeds();
      });
    });
  }

  // Prevenção básica de XSS no HTML inserido
  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[m]);
  }
});