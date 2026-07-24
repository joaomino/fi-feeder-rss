document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('add-form');
  const input = document.getElementById('feed-url');
  const limitSelect = document.getElementById('item-limit');
  const container = document.getElementById('feed-container');

  loadFeeds();

  // Adicionar novo feed
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = input.value.trim();
    if (!url) return;

    chrome.storage.sync.get({ feeds: [] }, (data) => {
      const exists = data.feeds.some(f => (typeof f === 'string' ? f : f.url) === url);
      if (exists) {
        alert('Este feed já está cadastrado!');
        return;
      }

      const updatedFeeds = [...data.feeds, { url: url, name: '' }];
      chrome.storage.sync.set({ feeds: updatedFeeds }, () => {
        input.value = '';
        loadFeeds();
      });
    });
  });

  if (limitSelect) {
    limitSelect.addEventListener('change', () => loadFeeds());
  }

  async function loadFeeds() {
    container.innerHTML = '<div class="status">Carregando...</div>';

    chrome.storage.sync.get({ feeds: [] }, async (data) => {
      try {
        if (!data.feeds || data.feeds.length === 0) {
          container.innerHTML = '<div class="status">Nenhum feed cadastrado.<br>Cole uma URL acima para começar!</div>';
          return;
        }

        container.innerHTML = '';

        for (const rawFeed of data.feeds) {
          const feed = typeof rawFeed === 'string' ? { url: rawFeed, name: '' } : rawFeed;
          if (feed && feed.url) {
            await fetchAndRenderFeed(feed);
          }
        }
      } catch (err) {
        container.innerHTML = `<div class="status" style="color: #e55151;">Erro ao ler o banco local.</div>`;
      }
    });
  }

  async function fetchAndRenderFeed(feed) {
    const limit = limitSelect ? parseInt(limitSelect.value, 10) : 5;

    try {
      const res = await fetch(feed.url);
      if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
      
      const text = await res.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(text, 'text/xml');

      if (xml.querySelector('parsererror')) {
        throw new Error('Conteúdo não é um XML/RSS válido');
      }

      const channelTitle = xml.querySelector('channel > title, feed > title')?.textContent || feed.url;
      const displayName = feed.name || channelTitle;
      const items = Array.from(xml.querySelectorAll('item, entry')).slice(0, limit);

      const section = document.createElement('div');
      
      section.innerHTML = `
        <div class="feed-header">
          <span class="feed-title" title="Clique para renomear">${escapeHtml(displayName)}</span>
          <div class="feed-actions">
            <button class="btn-action btn-edit">renomear</button>
            <button class="btn-action btn-remove">remover</button>
          </div>
        </div>
        <div class="rename-box">
          <input type="text" class="rename-input" value="${escapeHtml(displayName)}">
          <button class="btn-save">OK</button>
        </div>
        <div class="items-list"></div>
      `;

      const renameBox = section.querySelector('.rename-box');
      const renameInput = section.querySelector('.rename-input');
      const itemsList = section.querySelector('.items-list');

      const toggleRename = () => {
        const isHidden = renameBox.style.display !== 'flex';
        renameBox.style.display = isHidden ? 'flex' : 'none';
        if (isHidden) renameInput.focus();
      };

      section.querySelector('.btn-edit').addEventListener('click', toggleRename);
      section.querySelector('.feed-title').addEventListener('click', toggleRename);

      section.querySelector('.btn-save').addEventListener('click', () => {
        saveNewName(feed.url, renameInput.value.trim());
      });

      section.querySelector('.btn-remove').addEventListener('click', () => {
        removeFeed(feed.url);
      });

      // Renderização de notícias
      items.forEach(item => {
        const title = item.querySelector('title')?.textContent || 'Sem título';
        
        let rawLink = '';
        const linkTag = item.querySelector('link');
        if (linkTag) {
          rawLink = linkTag.getAttribute('href') || linkTag.textContent || '';
        }

        // LIMPEZA E TRATAMENTO DE URL
        let finalLink = '#';
        if (rawLink) {
          rawLink = rawLink.trim();
          
          // Se a URL do XML vem sem http:// ou https:// (Ex: cgi.br/noticia/...) adiciona o protocolo
          if (!rawLink.startsWith('http://') && !rawLink.startsWith('https://') && !rawLink.startsWith('/')) {
            rawLink = 'https://' + rawLink;
          }

          try {
            finalLink = new URL(rawLink, feed.url).href;
          } catch (e) {
            finalLink = rawLink;
          }
        }

        const pubDate = item.querySelector('pubDate, updated, date')?.textContent || '';

        const itemEl = document.createElement('a');
        itemEl.className = 'item';
        itemEl.href = finalLink;
        itemEl.target = '_blank';
        itemEl.rel = 'noopener noreferrer';

        let formattedDate = '';
        if (pubDate) {
          const parsedDate = new Date(pubDate);
          if (!isNaN(parsedDate)) {
            formattedDate = parsedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
          }
        }

        itemEl.innerHTML = `
          <div class="item-title">${escapeHtml(title)}</div>
          ${formattedDate ? `<div class="item-date">${formattedDate}</div>` : ''}
        `;

        itemsList.appendChild(itemEl);
      });

      container.appendChild(section);

    } catch (err) {
      const section = document.createElement('div');
      section.innerHTML = `
        <div class="feed-header">
          <span class="feed-title" style="color: #e55151;">${escapeHtml(feed.name || feed.url)}</span>
          <div class="feed-actions">
            <button class="btn-action btn-remove">remover</button>
          </div>
        </div>
        <div class="status" style="color: #e55151; padding: 10px 0;">
          Erro: ${escapeHtml(err.message)}
        </div>
      `;
      section.querySelector('.btn-remove').addEventListener('click', () => removeFeed(feed.url));
      container.appendChild(section);
    }
  }

  function saveNewName(url, newName) {
    chrome.storage.sync.get({ feeds: [] }, (data) => {
      const updatedFeeds = data.feeds.map(f => {
        const currentUrl = typeof f === 'string' ? f : f.url;
        if (currentUrl === url) {
          return { url: currentUrl, name: newName };
        }
        return typeof f === 'string' ? { url: f, name: '' } : f;
      });

      chrome.storage.sync.set({ feeds: updatedFeeds }, () => loadFeeds());
    });
  }

  function removeFeed(urlToRemove) {
    chrome.storage.sync.get({ feeds: [] }, (data) => {
      const updatedFeeds = data.feeds.filter(f => (typeof f === 'string' ? f : f.url) !== urlToRemove);
      chrome.storage.sync.set({ feeds: updatedFeeds }, () => loadFeeds());
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    })[m]);
  }
});