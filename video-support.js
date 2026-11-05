/* Vídeos de conteúdo: persistidos no mesmo projeto, sem serviços adicionais. */
(() => {
  'use strict';
  const MAX_BYTES = 5 * 1024 * 1024;
  const $v = id => document.getElementById(id);
  const isVideo = page => !!(page && pageOpts(page).videoEnabled !== false && /^data:video\/(mp4|webm);base64,/.test(page.videoData || ''));
  window.seseIsVideoPage = isVideo;

  const style = document.createElement('style'); style.id = 'pageVideoStyles';
  style.textContent = '#slide .page-video-frame{position:absolute;inset:0;z-index:80;background:#000;display:none}#slide.has-page-video .page-video-frame{display:block}#slide .page-video-frame video{width:100%;height:100%;object-fit:contain}#slide .page-video-frame [hidden],#videoPageGroup[hidden],#videoPageGroup [hidden]{display:none!important}#slide .page-video-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:#fff;font:20px Arial}#slide .page-video-empty button{padding:16px 28px;color:#fff;background:#1465ea;font:700 20px Arial}#slide .page-video-error{position:absolute;top:12%;left:10%;right:10%;padding:14px;background:#172638;color:white;font:16px Arial;text-align:center}';
  document.head.appendChild(style);
  const group = document.createElement('div');
  group.id = 'videoPageGroup'; group.hidden = true;
  group.innerHTML = '<p class="hint">Adicione o vídeo neste slide. MP4 (H.264) ou WebM, até 5 MB por arquivo. Na TV, o slide permanece até o vídeo terminar. Nas fotos e na impressão aparece somente a capa.</p><div class="btns"><button type="button" class="primary" id="addPageVideoBtn" style="grid-column:1/-1">🎬 Adicionar vídeo neste slide</button><button type="button" class="secondary" id="replacePageVideoBtn" hidden>Substituir vídeo</button><button type="button" class="secondary" id="removePageVideoBtn" hidden>Remover vídeo</button></div><input type="file" id="pageVideoInput" accept="video/mp4,video/webm,.mp4,.webm" hidden><p class="hint" id="pageVideoStatus" role="status" aria-live="polite"></p>';
  $v('extraLayoutGroup').querySelector('.layout-picker').after(group);
  const frame = document.createElement('div'); frame.className = 'page-video-frame';
  const player = document.createElement('video');
  player.id = 'pageVideoPlayer'; player.controls = true; player.playsInline = true; player.preload = 'metadata';
  player.setAttribute('aria-label', 'Vídeo da página');
  const errorBox = document.createElement('p'); errorBox.className = 'page-video-error'; errorBox.hidden = true; errorBox.setAttribute('role', 'status');
  const emptyBox = document.createElement('div'); emptyBox.className = 'page-video-empty';
  emptyBox.innerHTML = '<span>Vídeo neste slide</span><button type="button" id="addVideoOnSlideBtn">🎬 Adicionar vídeo</button><small>MP4 ou WebM · até 5 MB</small>';
  frame.append(player, emptyBox, errorBox); $v('slide').append(frame);
  let shownData = '', shownPage = null, busy = false, selectedTarget = null;
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
    const page = current(), has = isVideo(page), selected = pageKind(page) === 'video';
    $v('slide').classList.toggle('has-page-video', selected);
    group.hidden = !selected; emptyBox.hidden = has; player.hidden = !has;
    $v('addPageVideoBtn').hidden = has;
    $v('replacePageVideoBtn').hidden = !has; $v('removePageVideoBtn').hidden = !has;
    if (!busy) status(has ? page.videoName + ' · ' + Number(page.videoDuration || 0).toFixed(1) + ' s' : 'Nenhum vídeo nesta página.');
    if (!has) {
      errorBox.hidden = true;
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
  function choose() {
    selectedTarget = current();
    $v('pageVideoInput').click();
  }
  $v('addPageVideoBtn').onclick = choose;
  $v('addVideoOnSlideBtn').onclick = choose;
  $v('replacePageVideoBtn').onclick = choose;
  $v('removePageVideoBtn').onclick = () => {
    if (!confirm('Remover o vídeo desta página? A página será mantida.')) return;
    const change = projectHistoryBegin('remover vídeo');
    ['videoData', 'videoName', 'videoPoster', 'videoDuration'].forEach(key => { current()[key] = ''; });
    projectHistoryCommit(change); syncFormFromPage(); autoSaveProject();
    if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
  };
  $v('pageVideoInput').onchange = async event => {
    const file = event.target.files[0], targetPage = selectedTarget || current(), targetId = targetPage.id;
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
      const target = targetId ? pages.find(page => page.id === targetId) : pages.find(page => page === targetPage);
      if (!target) throw new Error('O slide foi excluído durante a leitura. Selecione outro slide.');
      const change = projectHistoryBegin(target.videoData ? 'substituir vídeo' : 'adicionar vídeo neste slide');
      Object.assign(target, { layout:'video', opts:JSON.stringify({...pageOpts(target), videoEnabled:true}), videoData: data, videoName: file.name, videoPoster: info.poster, videoDuration: String(info.duration) });
      currentPage = pages.indexOf(target);
      projectHistoryCommit(change); syncFormFromPage(); autoSaveProject();
      if (typeof scheduleCloudSave === 'function') scheduleCloudSave();
      status('Vídeo adicionado neste slide. Acompanhe a confirmação de sincronização na barra do projeto.');
    } catch (error) { status(error.message || 'Não foi possível acrescentar o vídeo.'); }
    finally { busy = false; selectedTarget = null; group.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
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
    recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 24000000, audioBitsPerSecond: 160000 });
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

/* MP4 com prioridade para detalhes: qualidade controlada por quadro, renderização
   nativa Full HD/4K e apenas o slide atual e o quadro anterior na memória. */
window.seseExportQualityMp4 = async ({ openingFile, list, renderPage, say, done, download, seconds, W, H, pickCodecs }) => {
  const FPS = 30, RATE = 48000, FADE_US = 600000;
  const music = !!window.seseMusic?.wantsExport();
  const hasMedia = !!openingFile || list.some(page => window.seseIsVideoPage?.(page));
  const codecs = await pickCodecs(hasMedia || music);
  // Os caminhos anteriores continuam disponíveis em navegadores sem H.264/AAC.
  if (!codecs || codecs.video.mux !== 'avc' || ((hasMedia || music) && codecs.audio?.mux !== 'aac')) return false;
  const videoConfig={...codecs.video.cfg,width:W,height:H,bitrate:W>1920?64000000:24000000,bitrateMode:'variable',latencyMode:'quality'};
  if(W>1920){
    let supported=false;
    for(const codec of ['avc1.640033','avc1.4d0033','avc1.42e033']){try{if((await VideoEncoder.isConfigSupported({...videoConfig,codec})).supported){videoConfig.codec=codec;supported=true;break;}}catch{}}
    if(!supported){alert('Este navegador não consegue gerar MP4 4K. Selecione Full HD com nitidez máxima.');return true;}
  }
  let quantizer=false;
  try{quantizer=(await VideoEncoder.isConfigSupported({...videoConfig,bitrateMode:'quantizer'})).supported;}catch{}
  const holdUs=quantizer?1000000:Math.round(1000000/FPS);
  let videoEncoder, audioEncoder, activeMedia, previous, output, failed = null;
  let videoSamples = 0, audioSamples = 0, peakSlideCanvases = 0;
  const started = performance.now();
  try {
    const timeline = [];
    if (openingFile) timeline.push({ file:openingFile, title:'abertura' });
    list.forEach((page, index) => timeline.push(window.seseIsVideoPage?.(page)
      ? { data:page.videoData, title:page.videoName || 'vídeo', page, index }
      : { page, index, title:'slide ' + (index + 1) }));
    const muxer = new Mp4Muxer.Muxer({
      target:new Mp4Muxer.ArrayBufferTarget(), video:{codec:'avc',width:W,height:H},
      ...((hasMedia || music) ? {audio:{codec:'aac',numberOfChannels:2,sampleRate:RATE}} : {}),
      fastStart:'in-memory', firstTimestampBehavior:'cross-track-offset'
    });
    videoEncoder = new VideoEncoder({output:(chunk,meta) => {videoSamples++;muxer.addVideoChunk(chunk,meta);},error:error => {failed=error;}});
    videoEncoder.configure({...videoConfig,bitrateMode:quantizer?'quantizer':'variable'});
    if (hasMedia || music) {
      audioEncoder = new AudioEncoder({output:(chunk,meta) => {audioSamples++;muxer.addAudioChunk(chunk,meta);},error:error => {failed=error;}});
      audioEncoder.configure(codecs.audio.cfg);
    }
    output = document.createElement('canvas'); output.width=W;output.height=H;
    const ctx=output.getContext('2d');
    previous=document.createElement('canvas');previous.width=W;previous.height=H;
    const prevCtx=previous.getContext('2d');
    let lastTimestamp=-1,lastKey=-Infinity,timeUs=0,audioFrame=0,openingFrames=0;
    const check=()=>{if(failed)throw failed;};
    const encode=async(timestamp,duration,key=false,motion=false)=>{
      check();if(timestamp<=lastTimestamp)return;
      while(videoEncoder.encodeQueueSize>4){await new Promise(r=>setTimeout(r,2));check();}
      const frame=new VideoFrame(output,{timestamp,duration:Math.max(1,duration)});
      const keyInterval=quantizer&&duration>=100000?10000000:2000000;
      const forceKey=key||timestamp-lastKey>=keyInterval;
      try{videoEncoder.encode(frame,{keyFrame:forceKey,...(quantizer?{avc:{quantizer:motion?14:10}}:{})});}finally{frame.close();}
      lastTimestamp=timestamp;if(forceKey)lastKey=timestamp;
    };
    const drawVideo=video=>{
      ctx.globalAlpha=1;ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
      const width=video.videoWidth||video.displayWidth,height=video.videoHeight||video.displayHeight;
      const r=Math.min(W/width,H/height),w=width*r,h=height*r;
      ctx.drawImage(video,(W-w)/2,(H-h)/2,w,h);
    };
    let musicBuffer=null;
    if(music){say('Preparando a música…');musicBuffer=await seseMusic.getBuffer(RATE);}
    async function encodeAudio(durationUs,sound,isMedia) {
      if(!audioEncoder)return;
      const endFrame=Math.round((timeUs+durationUs)/1000000*RATE),segmentStart=audioFrame;
      const left=sound?.getChannelData(0),right=sound?.getChannelData(Math.min(1,sound.numberOfChannels-1));
      const mL=musicBuffer?.getChannelData(0),mR=musicBuffer?.getChannelData(Math.min(1,musicBuffer.numberOfChannels-1));
      const gain=music?seseMusic.volume():0;
      while(audioFrame<endFrame){
        check();const n=Math.min(1024,endFrame-audioFrame),data=new Float32Array(n*2),sourceAt=audioFrame-segmentStart;
        if(left){const count=Math.min(n,Math.max(0,left.length-sourceAt));if(count){data.set(left.subarray(sourceAt,sourceAt+count));data.set(right.subarray(sourceAt,sourceAt+count),n);}}
        if(!isMedia&&mL){for(let i=0;i<n;i++){const elapsed=audioFrame+i-openingFrames,k=Math.max(0,elapsed)%musicBuffer.length,g=gain*Math.min(1,Math.max(0,elapsed)/RATE/2);data[i]=mL[k]*g;data[n+i]=mR[k]*g;}}
        const audio=new AudioData({format:'f32-planar',sampleRate:RATE,numberOfFrames:n,numberOfChannels:2,timestamp:Math.round(audioFrame/RATE*1000000),data});
        try{audioEncoder.encode(audio);}finally{audio.close();}
        audioFrame+=n;
        while(audioEncoder.encodeQueueSize>24){await new Promise(r=>setTimeout(r,1));check();}
      }
    }
    async function loadMedia(item) {
      const blob=item.file||await(await fetch(item.data)).blob(),url=URL.createObjectURL(blob);
      const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';
      activeMedia={video,url};
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Tempo excedido ao carregar '+item.title+'.')),30000);
        video.onloadeddata=()=>{clearTimeout(timer);resolve();};video.onerror=()=>{clearTimeout(timer);reject(new Error('Não foi possível ler '+item.title+'.'));};video.src=url;
      });
      if(!(video.duration>0&&isFinite(video.duration)))throw new Error('Duração inválida em '+item.title+'.');
      let sound=null;
      if(audioEncoder){try{sound=await new OfflineAudioContext(2,1,RATE).decodeAudioData(await blob.arrayBuffer());}catch(error){console.warn('Áudio indisponível em '+item.title,error);}}
      return {video,sound,durationUs:Math.round(video.duration*1000000)};
    }
    const releaseMedia=()=>{if(!activeMedia)return;activeMedia.video.pause();activeMedia.video.removeAttribute('src');activeMedia.video.load();URL.revokeObjectURL(activeMedia.url);activeMedia=null;};
    for(let i=0;i<timeline.length;i++){
      check();const item=timeline[i],isMedia=!!(item.file||item.data);
      say(`Preparando ${item.title} (${i+1} de ${timeline.length})…`);
      if(isMedia){
        const media=await loadMedia(item),segmentStart=timeUs;
        await encodeAudio(media.durationUs,media.sound,true);media.sound=null;
        drawVideo(media.video);await encode(timeUs,Math.min(33333,media.durationUs),true,true);
        await new Promise((resolve,reject)=>{
          let pending=Promise.resolve(),timer=null,callback=null,settled=false,queued=0;
          const finish=error=>{if(settled)return;settled=true;clearTimeout(guard);clearInterval(timer);if(callback!==null&&media.video.cancelVideoFrameCallback)media.video.cancelVideoFrameCallback(callback);media.video.pause();media.video.onended=media.video.onerror=null;pending.then(()=>error?reject(error):resolve(),reject);};
          const capture=t=>{
            if(settled)return;
            let snapshot;try{snapshot=new VideoFrame(media.video);}catch(error){finish(error);return;}
            queued++;if(queued>3)media.video.pause();
            pending=pending.then(async()=>{
              try{
                const relative=Math.min(media.durationUs-1,Math.round(t*1000000));
                drawVideo(snapshot);await encode(segmentStart+relative,Math.min(33333,media.durationUs-relative),false,true);
                say(`Gravando ${item.title}… ${Math.max(0,Math.ceil(media.video.duration-t))} s restantes`);
              }finally{snapshot.close();queued--;}
              if(!settled&&media.video.paused&&!media.video.ended)await media.video.play();
            }).catch(finish);
          };
          const guard=setTimeout(()=>finish(new Error('A reprodução foi interrompida em '+item.title+'.')),Math.max(60000,(media.video.duration*3+30)*1000));
          media.video.onended=()=>finish();media.video.onerror=()=>finish(new Error('Falha de reprodução em '+item.title+'.'));
          if(media.video.requestVideoFrameCallback){const next=(_,meta)=>{capture(meta.mediaTime);if(!settled)callback=media.video.requestVideoFrameCallback(next);};callback=media.video.requestVideoFrameCallback(next);}
          else timer=setInterval(()=>capture(media.video.currentTime),1000/FPS);
          media.video.play().catch(finish);
        });
        // A última amostra fecha exatamente o trecho, mesmo em vídeos de taxa variável.
        drawVideo(media.video);await encode(segmentStart+media.durationUs-1000,1000,false,true);
        timeUs+=media.durationUs;
        if(item.file)openingFrames=Math.round(timeUs/1000000*RATE);
        releaseMedia();
      }else{
        const slide=await renderPage(item.page,item.index);
        peakSlideCanvases=Math.max(peakSlideCanvases,3);
        const durationUs=Math.round(seconds*1000000);
        await encodeAudio(durationUs,null,false);
        const transition=i>0?Math.min(FADE_US,durationUs):0;
        let at=0;
        for(let frameIndex=0;frameIndex<Math.ceil(transition*FPS/1000000);frameIndex++){
          at=Math.round(frameIndex*1000000/FPS);
          const next=Math.min(transition,Math.round((frameIndex+1)*1000000/FPS));
          ctx.globalAlpha=1;ctx.drawImage(previous,0,0);ctx.globalAlpha=at/transition;ctx.drawImage(slide,0,0);ctx.globalAlpha=1;
          await encode(timeUs+at,next-at,at===0);at=next;
        }
        ctx.globalAlpha=1;ctx.drawImage(slide,0,0);
        while(at<durationUs){const duration=Math.min(holdUs,durationUs-at);await encode(timeUs+at,duration,at===transition);at+=duration;}
        timeUs+=durationUs;
        // A imagem do slide já está codificada; libera imediatamente sua memória.
        slide.width=slide.height=1;
      }
      prevCtx.clearRect(0,0,W,H);prevCtx.drawImage(output,0,0);
      await new Promise(r=>setTimeout(r,0));
    }
    say('Finalizando MP4 com nitidez máxima…');
    if(audioEncoder)await audioEncoder.flush();await videoEncoder.flush();check();muxer.finalize();
    const blob=new Blob([muxer.target.buffer],{type:'video/mp4'});
    window.seseLastMp4Export={width:W,height:H,durationSeconds:timeUs/1000000,bytes:blob.size,videoSamples,audioSamples,peakSlideCanvases,qualityMode:quantizer?'maximum':'high-bitrate',elapsedSeconds:(performance.now()-started)/1000};
    download(blob,'REGRAS_SESE_COMPLETO.mp4');
    alert(`MP4 ${W>1920?'4K':'Full HD'} pronto, com nitidez máxima (${(blob.size/1048576).toFixed(1)} MB). Conteúdo e duração preservados.`);
  }catch(error){console.error(error);alert('Não foi possível gerar o MP4: '+(error.message||error));}
  finally{
    if(activeMedia){activeMedia.video.pause();activeMedia.video.removeAttribute('src');activeMedia.video.load();URL.revokeObjectURL(activeMedia.url);}
    if(videoEncoder&&videoEncoder.state!=='closed')videoEncoder.close();if(audioEncoder&&audioEncoder.state!=='closed')audioEncoder.close();
    if(previous)previous.width=previous.height=1;if(output)output.width=output.height=1;done();
  }
  return true;
};
