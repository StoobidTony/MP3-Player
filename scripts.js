(function () {
  const fileInput = document.getElementById('fileInput');
  const playlistEl = document.getElementById('playlist');
  const audio = document.getElementById('audio');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const nowPlaying = document.getElementById('nowPlaying');
  const playlistLoopCheckbox = document.getElementById('playlistLoop');
  const clearBtn = document.getElementById('clearBtn');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeFill = document.getElementById('volumeFill');
  const progressBar = document.getElementById('progressBar');
  const progressSlider = document.getElementById('progressSlider');

  const DB_NAME = 'playlistDB';
  const STORE_NAME = 'songs';
  let db;
  let songs = [];
  let currentIndex = -1;

  function uid() { return Math.random().toString(36).slice(2, 9); }

  // ---------- IndexedDB ----------
  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = e => {
        db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = e => { db = e.target.result; resolve(db); };
      request.onerror = e => reject(e);
    });
  }

  function saveSong(song) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(song);
      tx.oncomplete = () => resolve();
      tx.onerror = e => reject(e);
    });
  }

  function deleteSong(id) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = e => reject(e);
    });
  }

  function loadAllSongs() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = e => resolve(e.target.result);
      request.onerror = e => reject(e);
    });
  }

  function updateSongOrders() {
    songs.forEach((s, i) => { s.order = i; saveSong(s); });
  }

  // ---------- Playlist ----------
  async function init() {
    await openDB();
    songs = (await loadAllSongs()).sort((a, b) => a.order - b.order);
    renderPlaylist();

    // Restore volume
    const savedVolume = localStorage.getItem('volume');
    if (savedVolume !== null) {
      audio.volume = savedVolume;
      volumeSlider.value = savedVolume;
    } else {
      audio.volume = volumeSlider.value;
    }
    volumeFill.style.width = (audio.volume * 100) + '%';
  }

  async function addFiles(fileList) {
    for (const f of Array.from(fileList)) {
      const song = { id: uid(), name: f.name, loop: false, blob: f, order: songs.length };
      songs.push(song);
      await saveSong(song);
    }
    renderPlaylist();
  }

  async function clearPlaylist() {
    for (const s of songs) await deleteSong(s.id);
    songs = [];
    currentIndex = -1;
    audio.pause(); audio.src = ''; nowPlaying.textContent = '';
    renderPlaylist();
  }

  async function removeAt(index) {
    const song = songs[index];
    await deleteSong(song.id);
    songs.splice(index, 1);
    updateSongOrders();
    renderPlaylist();
    if (currentIndex === index) { audio.pause(); audio.src = ''; currentIndex = -1; nowPlaying.textContent = ''; }
  }

  function playIndex(i) {
    if (i < 0 || i >= songs.length) return;
    currentIndex = i;
    const song = songs[i];
    audio.loop = !!song.loop;
    audio.src = URL.createObjectURL(song.blob);
    audio.play();
    highlightCurrent();
    nowPlaying.textContent = (i + 1) + ' / ' + songs.length + ' — ' + song.name + (song.loop ? ' (song loop)' : '');
  }

  function playNext() {
    if (currentIndex === -1 && songs.length) playIndex(0);
    else {
      let nxt = currentIndex + 1;
      if (nxt < songs.length) playIndex(nxt);
      else if (playlistLoopCheckbox.checked && songs.length) playIndex(0);
    }
  }

  function playPrev() { if (currentIndex > 0) playIndex(currentIndex - 1); }

  function toggleSongLoop(index) {
    songs[index].loop = !songs[index].loop;
    if (index === currentIndex) audio.loop = songs[index].loop;
    saveSong(songs[index]);
    renderPlaylist();
  }

  function moveUp(index) {
    if (index <= 0 || index >= songs.length) return;
    [songs[index - 1], songs[index]] = [songs[index], songs[index - 1]];
    updateSongOrders();
    renderPlaylist();
  }

  function moveDown(index) {
    if (index < 0 || index >= songs.length - 1) return;
    [songs[index], songs[index + 1]] = [songs[index + 1], songs[index]];
    updateSongOrders();
    renderPlaylist();
  }

  function highlightCurrent() {
    playlistEl.querySelectorAll('li').forEach(li => li.style.fontWeight = '');
    if (currentIndex >= 0) {
      const li = playlistEl.querySelector(`li[data-index='${currentIndex}']`);
      if (li) li.style.fontWeight = 'bold';
    }
  }

  function renderPlaylist() {
    playlistEl.innerHTML = '';
    songs.forEach((s, i) => {
      const li = document.createElement('li');
      li.draggable = true; li.dataset.index = i;

      const title = document.createElement('span');
      title.textContent = (i + 1) + '. ' + s.name;
      li.appendChild(title);

      const playBtn = document.createElement('button');
      playBtn.textContent = 'Play'; playBtn.addEventListener('click', () => playIndex(i)); li.appendChild(playBtn);

      const loopBtn = document.createElement('button');
      loopBtn.textContent = s.loop ? 'Song Loop: ON' : 'Song Loop: OFF'; loopBtn.addEventListener('click', () => toggleSongLoop(i)); li.appendChild(loopBtn);

      const upBtn = document.createElement('button'); upBtn.textContent = '↑'; upBtn.addEventListener('click', () => moveUp(i)); li.appendChild(upBtn);
      const downBtn = document.createElement('button'); downBtn.textContent = '↓'; downBtn.addEventListener('click', () => moveDown(i)); li.appendChild(downBtn);

      const removeBtn = document.createElement('button'); removeBtn.textContent = 'Remove'; removeBtn.addEventListener('click', () => removeAt(i)); li.appendChild(removeBtn);

      li.addEventListener('dragstart', handleDragStart); li.addEventListener('dragover', handleDragOver); li.addEventListener('drop', handleDrop);

      playlistEl.appendChild(li);
    });
    highlightCurrent();
  }

  // ---------- Drag and Drop ----------
  let dragSrcIndex = null;
  function handleDragStart(e) { dragSrcIndex = Number(this.dataset.index); e.dataTransfer.effectAllowed = 'move'; }
  function handleDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
  function handleDrop(e) {
    e.stopPropagation(); const destIndex = Number(this.dataset.index);
    if (dragSrcIndex === null || destIndex === dragSrcIndex) return;
    const [item] = songs.splice(dragSrcIndex, 1);
    songs.splice(destIndex, 0, item);
    updateSongOrders();
    renderPlaylist();
  }

  // ---------- Event listeners ----------
  fileInput.addEventListener('change', e => addFiles(e.target.files));
  clearBtn.addEventListener('click', () => clearPlaylist());
  playPauseBtn.addEventListener('click', () => { if (audio.src) { audio.paused ? audio.play() : audio.pause(); } else if (songs.length) playIndex(0); });
  prevBtn.addEventListener('click', playPrev); nextBtn.addEventListener('click', playNext);

  audio.addEventListener('play', () => { playPauseBtn.textContent = 'Pause'; });
  audio.addEventListener('pause', () => { playPauseBtn.textContent = 'Play'; });
  audio.addEventListener('ended', () => { if (audio.loop) return; playNext(); });

  // Keyboard support
  document.addEventListener('keydown', e => { if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { e.preventDefault(); audio.paused ? audio.play() : audio.pause(); } });

  // ---------- Progress bar (with draggable slider) ----------
  audio.addEventListener('timeupdate', () => {
    if (audio.duration) {
      const progressPercent = (audio.currentTime / audio.duration) * 100;
      progressBar.style.width = progressPercent + '%';
      progressSlider.value = progressPercent;
    }
  });

  progressSlider.addEventListener('input', () => {
    if (audio.duration) {
      const newTime = (progressSlider.value / 100) * audio.duration;
      audio.currentTime = newTime;
      progressBar.style.width = progressSlider.value + '%';
    }
  });

  // ---------- Volume control ----------
  function updateVolumeFill() {
    volumeFill.style.width = (volumeSlider.value * 100) + '%';
  }

  volumeSlider.addEventListener('input', () => {
    audio.volume = volumeSlider.value;
    updateVolumeFill();
    localStorage.setItem('volume', volumeSlider.value);
  });

  // Initialize
  init();
})();
