/* Vídeos de conteúdo: persistidos no mesmo projeto, sem serviços adicionais. */
(() => {
  'use strict';
  const MAX_BYTES = 5 * 1024 * 1024;
  const $v = id => document.getElementById(id);
  const isVideo = page => !!(page && /^data:video\/(mp4|webm);base64,/.test(page.videoData || ''));
  window.seseIsVideoPage = isVideo;

  const style = document.createElement('style'); style.id = 'pageVideoStyles';
  style.textContent = '#slide .page-video-frame{position:absolute;inset:0;z-index:80;background:#000;display:none}#slide.has-page-video .page-video-frame{display:block}#slide .page-video-frame video{width:100%;height:100%;object-fit:contain}#slide .page-video-error{position:absolute;top:12%;left:10%;right:10%;padding:14px;background:#172638;color:white;font:16px Arial;text-align:center}#videoPageGroup [hidden]{display:none!important}';
  document.head.appendChild(style);
  const group = document.createElement('div');
  group.className = 'group'; group.id = 'videoPageGroup'; group.dataset.mobilePanel = 'text';
  group.innerHTML = '<h2>Vídeos da apresentação</h2><p class="hint">Acrescente um vídeo em uma nova página, logo após a página atual. MP4 (H.264) ou WebM, até 5 MB por arquivo. Na TV, a página permanece até o vídeo terminar. Nas fotos e na impressão aparece somente a capa.</p><div class="btns"><button type="button" class="primary" id="addPageVideoBtn" style="grid-column:1/-1">🎬 Acrescentar vídeo</button><button type="button" class="secondary" id="replacePageVideoBtn" hidden>Substituir vídeo</button><button type="button" class="secondary" id="removePageVideoBtn" hidden>Remover vídeo</button></div><input type="file" id="pageVideoInput" accept="video/mp4,video/webm,.mp4,.webm" hidden><p class="hint" id="pageVideoStatus" role="status" aria-live="polite"></p>';
  $v('musicGroup').before(group);
  const frame = document.createElement('div'); frame.className = 'page-video-frame';
  const player = document.createElement('video');
  player.id = 'pageVideoPlayer'; player.controls = true; player.playsInline = true; player.preload = 'metadata';
  player.setAttribute('aria-label', 'Vídeo da página');
  const errorBox = document.createElement('p'); errorBox.className = 'page-video-error'; errorBox.hidden = true; errorBox.setAttribute('role', 'status');
  frame.append(player, errorBox); $v('slide').append(frame);
  let shownData = '', shownPage = null, busy = false, replaceTarget = null;
  const status = text => { $v('pageVideoStatus').textContent = text; };

  function playingInPresentation() {
    return document.body.classList.contains('tv-mode') && !openingVideoActive && !presentationPaused && isVideo(current());
  }
  function tryPlay() {
    if (!playingInPresentation() || player.ended) return;
    player.play().then(() => { errorBox.hidden = true; }).catch(() => {
      errorBox.textContent = 'Toque no botão de reprodução para iniciar o vídeo com som.'; errorBox.hidden = false;
    });
  }
  window.renderPageVideo = () => {
    const page = current(), has = isVideo(page);
    $v('slide').classList.toggle('has-page-video', has);
    $v('replacePageVideoBtn').hidden = !has; $v('removePageVideoBtn').hidden = !has;
    if (!busy) status(has ? page.videoName + ' · ' + Number(page.videoDuration || 0).toFixed(1) + ' s' : 'Nenhum vídeo nesta página.');
    if (!has) {
      player.pause(); player.removeAttribute('src'); player.load(); shownData = ''; shownPage = null;
      document.body.classList.remove('page-video-playing'); return;
    }
    if (shownData !== page.videoData || shownPage !== page.id) {
      player.pause(); player.src = page.videoData; player.poster = page.videoPoster || '';
      shownData = page.videoData; shownPage = page.id; errorBox.hidden = true;
    }
    document.body.classList.toggle('page-video-playing', playingInPresentation());
    if (playingInPresentation()) tryPlay(); else player.pause();
  };
  player.addEventListener('error', () => {
    if (!shownData) return;
    errorBox.textContent = 'Não foi possível reproduzir este vídeo. Substitua por um MP4 H.264 compatível.'; errorBox.hidden = false;
  });
  player.addEventListener('ended', () => {
    if (!playingInPresentation() || !autoTvActive) return;
    const order = presentableIndexes();
    if (currentPage >= order[order.length - 1]) startOpeningVideo(); else nextPresentationPage();
    scheduleAutoTvSlides();
  });
  player.addEventListener('playing', () => { errorBox.hidden = true; });
  // Evita que as teclas dos controles de vídeo também naveguem entre páginas.
  player.addEventListener('keydown', event => { if (event.key !== 'Escape') event.stopPropagation(); });
  let presentationState = '';
  new MutationObserver(() => {
    const state = [document.body.classList.contains('tv-mode'), openingVideoActive, presentationPaused].join(':');
    if (state === presentationState) return;
    presentationState = state; window.renderPageVideo();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  function probe(file) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video'), url = URL.createObjectURL(file);
      let finished = false;
      const cleanup = () => { clearTimeout(timer); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); };
      const fail = () => { if (finished) return; finished = true; cleanup(); reject(new Error('Vídeo inválido ou incompatível. Use MP4 H.264 ou WebM.')); };
      const timer = setTimeout(fail, 20000);
      video.muted = true; video.preload = 'auto'; video.onerror = fail;
      video.onloadeddata = () => {
        if (finished) return;
        if (!(video.duration > 0 && Number.isFinite(video.duration) && video.videoWidth && video.videoHeight)) { fail(); return; }
        try {
          const canvas = document.createElement('canvas');
          const ratio = Math.min(1, 1280 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * ratio); canvas.height = Math.round(video.videoHeight * ratio);
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
          const result = { poster: canvas.toDataURL('image/jpeg', .85), duration: video.duration };
          finished = true; cleanup(); resolve(result);
        } catch (_) { fail(); }
      };
      video.src = url;
    });
  }
  function choose(replace) {
    replaceTarget = replace ? current().id : null;
    $v('pageVideoInput').click();
  }
  $v('addPageVideoBtn').onclick = () => choose(false);
  $v('replacePageVideoBtn').onclick = () => choose(true);
  $v('removePageVideoBtn').onclick = () => {
    if (!confirm('Remover o vídeo desta página? A página será mantida.')) return;
    const change = projectHistoryBegin('remover vídeo');
    ['videoData', 'videoName', 'videoPoster', 'videoDuration'].forEach(key => { current()[key] = ''; });
    projectHistoryCommit(change); syncFormFromPage(); autoSaveProject();
    if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
  };
  $v('pageVideoInput').onchange = async event => {
    const file = event.target.files[0], targetId = replaceTarget, afterId = current().id;
    event.target.value = ''; if (!file || busy) return;
    busy = true;
    group.querySelectorAll('button').forEach(button => { button.disabled = true; });
    status('Lendo e validando o vídeo…');
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!['mp4', 'webm'].includes(ext)) throw new Error('Selecione um arquivo MP4 ou WebM.');
      if (!file.size || file.size > MAX_BYTES) throw new Error('O vídeo deve ter até 5 MB. Comprima o arquivo antes de acrescentar.');
      const info = await probe(file);
      const blob = new Blob([file], { type: ext === 'mp4' ? 'video/mp4' : 'video/webm' });
      const data = await originalImageDataURL(blob);
      let target = targetId ? pages.find(page => page.id === targetId) : null;
      if (targetId && !target) throw new Error('A página foi excluída durante a leitura. Selecione outra página.');
      const change = projectHistoryBegin(targetId ? 'substituir vídeo' : 'acrescentar vídeo');
      if (!target) {
        target = { id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ''), layout: 'image', opts: '{"full":true}', elements: '[]', floatImages: {}, leftImages: [], rightImages: [], hidden: false };
        const at = pages.findIndex(page => page.id === afterId);
        pages.splice(at >= 0 ? at + 1 : pages.length, 0, target);
      }
      Object.assign(target, { videoData: data, videoName: file.name, videoPoster: info.poster, videoDuration: String(info.duration) });
      currentPage = pages.indexOf(target);
      projectHistoryCommit(change); syncFormFromPage(); autoSaveProject();
      if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
      status('Vídeo acrescentado. Acompanhe a confirmação de sincronização na barra do projeto.');
    } catch (error) { status(error.message || 'Não foi possível acrescentar o vídeo.'); }
    finally { busy = false; group.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
  };
  window.renderPageVideo();
})();

// Usa a gravação em tempo real para preservar imagem em movimento e áudio dos vídeos.
window.seseExportVideoPages = async ({ openingFile, list, renderAll, say, done, download, seconds, W, H }) => {
  let recorder, stream, audio, musicSource, activeVideo;
  const videos = new Map(), urls = [];
  try {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) throw new Error('Use Chrome ou Edge atualizado para exportar páginas com vídeo.');
    const type = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
    if (!type) throw new Error('O navegador não oferece gravação de vídeo.');
    if (!type.startsWith('video/mp4') && !confirm('Este navegador exporta WebM. Algumas TVs exigem MP4. Continuar em WebM?')) return;
    const slides = await renderAll(say), canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d'); stream = canvas.captureStream(30);
    audio = new (window.AudioContext || window.webkitAudioContext)(); await audio.resume();
    const dest = audio.createMediaStreamDestination(); dest.stream.getAudioTracks().forEach(track => stream.addTrack(track));
    const load = async src => {
      const video = document.createElement('video'); video.playsInline = true; video.preload = 'auto';
      videos.set(src, video);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Tempo excedido ao carregar um vídeo.')), 30000);
        video.onloadeddata = () => { clearTimeout(timer); resolve(); };
        video.onerror = () => { clearTimeout(timer); reject(new Error('Não foi possível carregar um vídeo da apresentação.')); };
        video.src = src;
      });
      audio.createMediaElementSource(video).connect(dest);
      return video;
    };
    const timeline = [];
    if (openingFile) { const url = URL.createObjectURL(openingFile); urls.push(url); timeline.push({ video: await load(url), name: 'abertura' }); }
    for (let i = 0; i < list.length; i++) timeline.push(window.seseIsVideoPage(list[i])
      ? { video: await load(list[i].videoData), name: list[i].videoName }
      : { image: slides[i], name: 'página ' + (i + 1) });
    let musicBuffer = null;
    if (window.seseMusic?.wantsExport()) musicBuffer = await seseMusic.getBuffer(audio.sampleRate);
    const musicGain = audio.createGain(); musicGain.gain.value = window.seseMusic ? seseMusic.volume() : 0; musicGain.connect(dest);
    if (musicBuffer) { musicSource = audio.createBufferSource(); musicSource.buffer = musicBuffer; musicSource.loop = true; musicSource.connect(musicGain); musicSource.start(); }
    recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8000000, audioBitsPerSecond: 160000 });
    const chunks = [];
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    let recorderError = null;
    const stopped = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.onerror = event => { recorderError = event.error || new Error('Falha na gravação.'); };
    recorder.start(1000);
    for (const item of timeline) {
      if (recorderError) throw recorderError;
      musicGain.gain.value = item.video ? 0 : (window.seseMusic ? seseMusic.volume() : 0);
      say('Gravando ' + item.name + '… Mantenha esta aba aberta e visível.');
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      if (!item.video) {
        ctx.drawImage(item.image, 0, 0, W, H);
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
        continue;
      }
      activeVideo = item.video; activeVideo.currentTime = 0;
      await new Promise((resolve, reject) => {
        let timer, guard, settled = false;
        const finish = error => {
          if (settled) return; settled = true;
          clearInterval(timer); clearTimeout(guard); activeVideo.pause();
          activeVideo.onended = activeVideo.onerror = null;
          error ? reject(error) : resolve();
        };
        const draw = () => {
          try {
            const r = Math.min(W / activeVideo.videoWidth, H / activeVideo.videoHeight);
            const w = activeVideo.videoWidth * r, h = activeVideo.videoHeight * r;
            ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
            ctx.drawImage(activeVideo, (W - w) / 2, (H - h) / 2, w, h);
            if (recorderError) finish(recorderError);
          } catch (error) { finish(error); }
        };
        activeVideo.onended = () => finish(); activeVideo.onerror = () => finish(new Error('A reprodução do vídeo falhou durante a gravação.'));
        timer = setInterval(draw, 1000 / 30);
        guard = setTimeout(() => finish(new Error('A reprodução do vídeo foi interrompida. Tente novamente.')), (activeVideo.duration + 30) * 1000);
        activeVideo.play().catch(finish);
      });
      activeVideo = null;
    }
    recorder.stop(); await stopped;
    if (recorderError) throw recorderError;
    download(new Blob(chunks, { type }), 'REGRAS_SESE_COMPLETO.' + (type.startsWith('video/mp4') ? 'mp4' : 'webm'));
    alert('Apresentação exportada com os vídeos e seus sons.');
  } catch (error) { alert('Não foi possível gerar a apresentação: ' + error.message); }
  finally {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    videos.forEach(video => { video.pause(); video.removeAttribute('src'); video.load(); });
    if (musicSource) musicSource.stop();
    if (stream) stream.getTracks().forEach(track => track.stop());
    if (audio) await audio.close(); urls.forEach(url => URL.revokeObjectURL(url)); done();
  }
};
