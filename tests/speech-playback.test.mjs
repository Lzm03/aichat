import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual modal playback code with controllable audio/network clocks.
const source = fs.readFileSync(new URL('../components/workshop/PublishSuccessModal.tsx', import.meta.url), 'utf8');
const playback = source.slice(source.indexOf('const enqueueSpeak ='), source.indexOf('useEffect(() => {\n  if (!isOpen) return;\n  const resumeAudio'));
const pump = source.slice(source.indexOf('const pumpTTSRequests ='), source.indexOf('const isSentenceEnd ='));
const stop = source.slice(source.indexOf("const stopAllSpeech ="), source.indexOf("const extractQuestionFromReply"));
function harness() {
  const ref = current => ({current});
  const requests = [];
  const starts = [];
  const rejections = [];
  const frames = new Map();
  let frameId = 0;
  let state;
  const player = {duration:4, currentTime:0, pause:()=>{}, play: () => new Promise((resolve, reject) => {starts.push(resolve); rejections.push(reject);})};
  let messages = [{role:'bot', content:''}];
  const context = {
    voicePlaybackEnabledRef:ref(true), voiceId:'test', ttsSeq:ref(0),
    speechProgressRafRef:ref(null),
    guideActivationTimerRef:ref(null), idleGuideTimerRef:ref(null),
    activeRequestController:ref(null), ttsRequestControllers:ref(new Set()),
    speechRevealRef:ref(new Map()), failedSpeechRef:ref(new Set()),
    ttsTextQueue:ref([]), ttsAudioMap:ref(new Map()), ttsInflight:ref(0),
    ttsSessionRef:ref(1), generationIdRef:ref(1), nextPlaySeq:ref(0),
    playing:ref(false), activeAudioUrl:ref(null), ttsPlayerRef:ref(player),
    audioRetryTimerRef:ref(null), lastUserGestureRef:ref(0),
    shouldRequirePermission:false, permissionReady:true, maxTtsInflight:3,
    setMessages: fn => { messages = fn(messages); },
    setIsBooting:()=>{}, setBotState:value=>{state=value;}, setIsStopAvailable:()=>{}, setAwaitingAudioGesture:()=>{},
    requestTTSAudio:()=>new Promise(resolve => requests.push(resolve)),
    URL:{revokeObjectURL:()=>{}}, window:{clearTimeout:()=>{}, requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id)}, console,
  };
  vm.createContext(context);
  vm.runInContext(ts.transpile(playback + pump + stop + '\nthis.present = presentSpokenReply; this.stop = stopAllSpeech;', {target:ts.ScriptTarget.ES2022}), context);
  return {context, requests, starts, rejections, player, text:()=>messages[0].content, state:()=>state, tick:time=>{player.currentTime=time;const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());}};
}
const flush = async () => { for(let i=0;i<8;i++) await Promise.resolve(); };
test('four-second audio reveals text by media progress and completes on ended', async () => {
  const h = harness(); h.context.present('一二三四五六七八',1);
  assert.equal(h.state(),'thinking'); assert.equal(h.text(),'');
  h.requests[0]('audio'); await flush(); assert.equal(h.text(),'');
  h.starts[0](); await flush(); assert.equal(h.state(),'speaking');
  h.tick(1); assert.equal(h.text(),'一二');
  h.tick(2); assert.equal(h.text(),'一二三四');
  h.tick(2); assert.equal(h.text(),'一二三四');
  h.player.onended(); assert.equal(h.text(),'一二三四五六七八');
});
test('stop freezes text and ignores late audio callbacks', async () => {
  const h = harness(); h.context.present('一二三四五六七八',1);
  h.requests[0]('audio'); await flush(); h.starts[0](); await flush();
  h.tick(2); const ended=h.player.onended;
  h.context.stop(); h.tick(4); ended();
  assert.equal(h.text(),'一二三四');
});
test('failed synthesis displays the entire reply, including queued sentences', async () => {
  const h = harness(); h.context.present('失敗！成功！尾句',1);
  h.requests[1]('second'); h.requests[0](undefined); await flush();
  assert.equal(h.text(),'失敗！成功！尾句'); assert.equal(h.state(),'idle');
  h.requests[2]('late'); await flush(); assert.equal(h.text(),'失敗！成功！尾句');
});
test('media error shows all text and stops playback', async () => {
  const h = harness(); h.context.present('第一句！第二句！',1);
  h.requests[0]('audio'); await flush(); h.starts[0](); await flush();
  h.player.onerror(); assert.equal(h.text(),'第一句！第二句！');
  h.tick(2); assert.equal(h.text(),'第一句！第二句！');
});
test('out-of-order synthesis waits for the first sentence', async () => {
  const h=harness(); h.context.present('第一句！第二句！',1);
  h.requests[1]('second'); await flush(); assert.equal(h.starts.length,0);
  h.requests[0]('first'); await flush(); h.starts[0](); await flush();
  h.tick(2); assert.equal(h.text(),'第一'); h.player.onended();
  h.player.currentTime=0; h.starts[1](); await flush(); h.tick(2);
  assert.equal(h.text(),'第一句！第二'); h.player.onended();
  assert.equal(h.text(),'第一句！第二句！');
});
test('text-only mode preserves complete reply without requesting audio', () => {
  const h = harness(); h.context.voicePlaybackEnabledRef.current=false;
  h.context.present('Hello!\n下一句。尾句',1);
  assert.equal(h.text(),'Hello!\n下一句。尾句'); assert.equal(h.requests.length,0);
});

test('autoplay rejection displays complete text and cancels progress', async () => {
  const h = harness(); h.context.present('第一句！第二句！',1);
  h.requests[0]('audio'); await flush();
  h.rejections[0](new Error('NotAllowedError')); await flush();
  assert.equal(h.text(),'第一句！第二句！'); assert.equal(h.state(),'idle');
  h.tick(1); assert.equal(h.text(),'第一句！第二句！');
});
