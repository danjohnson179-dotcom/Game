import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';

const $ = id => document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const rand=(a,b)=>a+Math.random()*(b-a);

const state={
  running:false, paused:false, difficulty:'trainee', shiftLength:300, shiftRemaining:300,
  queue:42, served:0, seated:0, capacity:24, score:0, satisfaction:96, reliability:100,
  entryOpen:false, exitOpen:false, restraintsLocked:false, platformChecked:false,
  rideHold:false, estop:false, stationTrain:0, weather:'clear', lastDispatch:null, dispatchTimes:[],
  nextEvent:20, loadingTimer:0, unloadTimer:0, cameraIndex:0, musicOn:true, soundOn:true, cameraDemo:false
};

const trainStates=[
  {phase:0.012,mode:'station',speed:0,color:0x6ae3ff},
  {phase:.44,mode:'course',speed:.026,color:0x8d75ff},
  {phase:.76,mode:'course',speed:.024,color:0xff6b85}
];

let scene,camera,renderer,clock,trackCurve,trackLength=1,trainGroups=[],guestMeshes=[],stationGuests=[];
let trees, supports, rainPoints, sunLight, hemiLight, stationGroup, cameraRig, heroCtx;
let audio={ctx:null,master:null,music:null,files:{},started:false};

const CAMERA_MODES=['PLATFORM CAMERA','TRACKSIDE CAMERA','CHASE CAMERA','OVERVIEW CAMERA'];

boot();

function boot(){
  bindUI();
  initHeroCanvas();
  animateHero();
  $('playBtn').onclick=()=>$('startModal').classList.remove('hidden');
  $('demoBtn').onclick=()=>{state.cameraDemo=true; $('startModal').classList.remove('hidden')};
  $('closeStartBtn').onclick=()=>{$('startModal').classList.add('hidden');state.cameraDemo=false};
  document.querySelectorAll('.diff-btn').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.diff-btn').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.difficulty=btn.dataset.difficulty});
  $('beginShiftBtn').onclick=async()=>{await ensureAudio(); startGame()};
  $('soundPreviewBtn').onclick=async()=>{await ensureAudio(); playSfx('dispatch',.45)};
  $('homeBtn').onclick=goHome; $('replayBtn').onclick=()=>{ $('endModal').classList.add('hidden'); startGame() };
}

function bindUI(){
  $('entryBtn').onclick=toggleEntry; $('exitBtn').onclick=toggleExit; $('restraintsBtn').onclick=toggleRestraints;
  $('checkBtn').onclick=platformCheck; $('holdBtn').onclick=toggleHold; $('dispatchBtn').onclick=dispatch;
  $('estopBtn').onclick=toggleEStop; $('cameraBtn').onclick=cycleCamera;
  $('audioBtn').onclick=()=>{state.soundOn=!state.soundOn; applyAudioState(); updateUI()};
  $('musicBtn').onclick=()=>{state.musicOn=!state.musicOn; applyAudioState(); updateUI()};
  $('pauseBtn').onclick=()=>{state.paused=!state.paused; $('pauseBtn').textContent=state.paused?'RESUME':'PAUSE'};
  window.addEventListener('resize',resizeRenderer);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)state.paused=true});
}

async function ensureAudio(){
  if(audio.started){ if(audio.ctx?.state==='suspended') await audio.ctx.resume(); return; }
  audio.started=true;
  audio.ctx=new (window.AudioContext||window.webkitAudioContext)();
  audio.master=audio.ctx.createGain(); audio.master.gain.value=.75; audio.master.connect(audio.ctx.destination);
  const paths={dispatch:'assets/audio/dispatch.wav',gate:'assets/audio/gate.wav',restraint:'assets/audio/restraint.wav',brake:'assets/audio/brake.wav',warning:'assets/audio/warning.wav',whoosh:'assets/audio/whoosh.wav',crowd:'assets/audio/crowd.wav',music:'assets/audio/music.wav'};
  await Promise.all(Object.entries(paths).map(async([k,p])=>{try{const r=await fetch(p); const b=await r.arrayBuffer(); audio.files[k]=await audio.ctx.decodeAudioData(b)}catch(e){console.warn('Audio load failed',k,e)}}));
  startLoop('crowd',.12,false);
  startLoop('music',.20,true);
  applyAudioState();
}
function playSfx(name,vol=.35,rate=1){ if(!audio.ctx||!audio.files[name]||!state.soundOn)return; const s=audio.ctx.createBufferSource(); const g=audio.ctx.createGain(); s.buffer=audio.files[name];s.playbackRate.value=rate;g.gain.value=vol;s.connect(g).connect(audio.master);s.start(); }
function startLoop(name,vol,isMusic){ if(!audio.ctx||!audio.files[name])return; const s=audio.ctx.createBufferSource();const g=audio.ctx.createGain();s.buffer=audio.files[name];s.loop=true;g.gain.value=vol;s.connect(g).connect(audio.master);s.start(); if(isMusic)audio.music={src:s,gain:g}; else audio.ambience={src:s,gain:g}; }
function applyAudioState(){ if(audio.master)audio.master.gain.value=state.soundOn?.78:0; if(audio.music?.gain)audio.music.gain.value=state.musicOn?.22:0; }

function startGame(){
  resetState();
  $('startModal').classList.add('hidden'); $('launcher').classList.add('hidden'); $('game').classList.remove('hidden');
  if(renderer){renderer.dispose(); $('webglMount').innerHTML='';}
  init3D(); state.running=true; clock=new THREE.Clock(); log('Shift started. Iron Comet online.','good'); updateUI(); animate();
}
function resetState(){
  state.running=false; state.paused=false; state.shiftRemaining=300; state.queue=state.difficulty==='chaos'?78:state.difficulty==='operator'?55:38;
  state.served=0;state.seated=0;state.score=0;state.satisfaction=96;state.reliability=100;state.entryOpen=false;state.exitOpen=false;
  state.restraintsLocked=false;state.platformChecked=false;state.rideHold=false;state.estop=false;state.stationTrain=0;state.weather='clear';state.lastDispatch=null;state.dispatchTimes=[];state.nextEvent=rand(16,26);state.loadingTimer=0;state.unloadTimer=0;
  trainStates[0].phase=.012;trainStates[0].mode='station';trainStates[0].speed=0;trainStates[1].phase=.43;trainStates[1].mode='course';trainStates[1].speed=.026;trainStates[2].phase=.76;trainStates[2].mode='course';trainStates[2].speed=.024;
  $('eventLog').innerHTML='';
}
function goHome(){state.running=false;$('endModal').classList.add('hidden');$('game').classList.add('hidden');$('launcher').classList.remove('hidden');}

function init3D(){
  scene=new THREE.Scene(); scene.background=new THREE.Color(0x09111a); scene.fog=new THREE.FogExp2(0x0a121b,.008);
  camera=new THREE.PerspectiveCamera(58,innerWidth/(innerHeight*.66),.1,900); camera.position.set(-28,18,30);
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05; $('webglMount').appendChild(renderer.domElement);
  hemiLight=new THREE.HemisphereLight(0x8fc9ff,0x263017,1.45);scene.add(hemiLight); sunLight=new THREE.DirectionalLight(0xffe8ca,2.5);sunLight.position.set(-35,55,20);sunLight.castShadow=true;sunLight.shadow.mapSize.set(2048,2048);sunLight.shadow.camera.left=-70;sunLight.shadow.camera.right=70;sunLight.shadow.camera.top=70;sunLight.shadow.camera.bottom=-70;scene.add(sunLight);
  const fill=new THREE.PointLight(0x6ecbff,9,65,2);fill.position.set(-18,8,8);scene.add(fill); const warm=new THREE.PointLight(0xff7f50,7,45,2);warm.position.set(17,8,-7);scene.add(warm);
  buildGround(); buildTrack(); buildStation(); buildScenery(); buildGuests(); buildTrains(); buildRain(); resizeRenderer();
}

function buildGround(){
  const g=new THREE.PlaneGeometry(220,220,40,40); g.rotateX(-Math.PI/2); const pos=g.attributes.position;
  for(let i=0;i<pos.count;i++){const x=pos.getX(i),z=pos.getZ(i);const d=Math.hypot(x,z);pos.setY(i,Math.sin(x*.11)*.5+Math.cos(z*.09)*.4-Math.max(0,d-65)*.018)}g.computeVertexNormals();
  const m=new THREE.MeshStandardMaterial({color:0x24351e,roughness:.95,metalness:0});const mesh=new THREE.Mesh(g,m);mesh.receiveShadow=true;scene.add(mesh);
  const water=new THREE.Mesh(new THREE.CircleGeometry(18,64),new THREE.MeshStandardMaterial({color:0x0d2539,roughness:.25,metalness:.15,transparent:true,opacity:.88}));water.rotation.x=-Math.PI/2;water.position.set(37,.18,28);scene.add(water);
}

function buildTrack(){
  const pts=[new THREE.Vector3(-25,4,1),new THREE.Vector3(-16,4,-6),new THREE.Vector3(-5,20,-15),new THREE.Vector3(9,31,-8),new THREE.Vector3(26,20,4),new THREE.Vector3(34,6,19),new THREE.Vector3(18,3,31),new THREE.Vector3(-2,11,26),new THREE.Vector3(-22,7,18),new THREE.Vector3(-34,3,8),new THREE.Vector3(-25,4,1)];
  trackCurve=new THREE.CatmullRomCurve3(pts,true,'centripetal');trackLength=trackCurve.getLength();
  const railMat=new THREE.MeshStandardMaterial({color:0x9ba7b1,metalness:.8,roughness:.28});
  [-.62,.62].forEach(side=>{const railCurve=offsetCurve(trackCurve,side);const tube=new THREE.Mesh(new THREE.TubeGeometry(railCurve,420,.14,8,true),railMat);tube.castShadow=true;tube.receiveShadow=true;scene.add(tube)});
  const spine=new THREE.Mesh(new THREE.TubeGeometry(trackCurve,420,.10,8,true),new THREE.MeshStandardMaterial({color:0x324051,metalness:.65,roughness:.4}));scene.add(spine);
  const tieGeo=new THREE.BoxGeometry(1.7,.12,.22); const tieMat=new THREE.MeshStandardMaterial({color:0x485564,metalness:.55,roughness:.45}); const count=170; const ties=new THREE.InstancedMesh(tieGeo,tieMat,count); ties.castShadow=true; const dummy=new THREE.Object3D();
  for(let i=0;i<count;i++){const t=i/count,p=trackCurve.getPointAt(t),tan=trackCurve.getTangentAt(t).normalize();dummy.position.copy(p);dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),tan);dummy.updateMatrix();ties.setMatrixAt(i,dummy.matrix)}scene.add(ties);
  buildSupports();
}
function offsetCurve(curve,side){const pts=[];for(let i=0;i<=220;i++){const t=i/220,p=curve.getPointAt(t),tan=curve.getTangentAt(t).normalize(),sideV=new THREE.Vector3(-tan.z,0,tan.x).normalize().multiplyScalar(side);pts.push(p.clone().add(sideV))}return new THREE.CatmullRomCurve3(pts,true,'centripetal')}
function buildSupports(){const geo=new THREE.CylinderGeometry(.13,.18,1,6);const mat=new THREE.MeshStandardMaterial({color:0x596576,metalness:.72,roughness:.35});const count=90;supports=new THREE.InstancedMesh(geo,mat,count*2);supports.castShadow=true;const dummy=new THREE.Object3D();let idx=0;for(let i=0;i<count;i++){const p=trackCurve.getPointAt(i/count);if(p.y<5.2)continue;for(const dx of [-.55,.55]){const h=p.y;dummy.position.set(p.x+dx,h/2,p.z);dummy.scale.set(1,h,1);dummy.rotation.z=dx*.035;dummy.updateMatrix();supports.setMatrixAt(idx++,dummy.matrix)}}supports.count=idx;scene.add(supports)}

function buildStation(){
  stationGroup=new THREE.Group();stationGroup.position.set(-25,0,1);scene.add(stationGroup);
  const floor=new THREE.Mesh(new THREE.BoxGeometry(18,.6,11),new THREE.MeshStandardMaterial({color:0x2a3038,roughness:.72,metalness:.25}));floor.position.set(0,.3,0);floor.receiveShadow=true;stationGroup.add(floor);
  const roof=new THREE.Mesh(new THREE.BoxGeometry(19,.5,12),new THREE.MeshStandardMaterial({color:0x141b24,roughness:.6,metalness:.5}));roof.position.set(0,7,0);roof.castShadow=true;stationGroup.add(roof);
  const beamMat=new THREE.MeshStandardMaterial({color:0x394759,metalness:.6,roughness:.38});for(const x of [-8,-3,3,8])for(const z of [-5,5]){const b=new THREE.Mesh(new THREE.BoxGeometry(.3,7,.3),beamMat);b.position.set(x,3.5,z);b.castShadow=true;stationGroup.add(b)}
  const platformLightMat=new THREE.MeshStandardMaterial({color:0xddefff,emissive:0x9ad8ff,emissiveIntensity:3});for(let x=-7;x<=7;x+=3.5){const l=new THREE.Mesh(new THREE.BoxGeometry(2.2,.08,.22),platformLightMat);l.position.set(x,6.6,0);stationGroup.add(l)}
  const sign=new THREE.Mesh(new THREE.BoxGeometry(6,1.1,.15),new THREE.MeshStandardMaterial({color:0x10283b,emissive:0x1b91c8,emissiveIntensity:1.8}));sign.position.set(0,5.3,-5.5);stationGroup.add(sign);
  buildGates();
}
function buildGates(){const mat=new THREE.MeshStandardMaterial({color:0x516170,metalness:.65,roughness:.38});for(const x of [-6,-4,-2,0,2,4,6]){const post=new THREE.Mesh(new THREE.BoxGeometry(.12,1.25,.12),mat);post.position.set(x,1.2,3.8);stationGroup.add(post);const arm=new THREE.Mesh(new THREE.BoxGeometry(1.5,.1,.1),mat);arm.position.set(x+.7,1.65,3.8);stationGroup.add(arm)}}

function buildScenery(){
  const trunkGeo=new THREE.CylinderGeometry(.11,.16,1.8,6), leafGeo=new THREE.ConeGeometry(.72,2.4,7);const trunkMat=new THREE.MeshStandardMaterial({color:0x513c2a}),leafMat=new THREE.MeshStandardMaterial({color:0x1d4b2d,roughness:1});const total=180;const trunks=new THREE.InstancedMesh(trunkGeo,trunkMat,total),leaves=new THREE.InstancedMesh(leafGeo,leafMat,total);const dummy=new THREE.Object3D>();let n=0;for(let i=0;i<total;i++){const a=Math.random()*Math.PI*2,r=rand(38,92),x=Math.cos(a)*r,z=Math.sin(a)*r;if(Math.abs(x+25)<16&&Math.abs(z-1)<12)continue;const s=rand(.7,1.5);dummy.position.set(x,.9*s,z);dummy.scale.set(s,s,s);dummy.rotation.y=Math.random()*6;dummy.updateMatrix();trunks.setMatrixAt(n,dummy.matrix);dummy.position.set(x,2.7*s,z);dummy.updateMatrix();leaves.setMatrixAt(n,dummy.matrix);n++}trunks.count=leaves.count=n;trunks.castShadow=true;leaves.castShadow=true;scene.add(trunks,leaves);trees=[trunks,leaves];
  const moon=new THREE.Mesh(new THREE.SphereGeometry(4,24,24),new THREE.MeshBasicMaterial({color:0xdde7f5}));moon.position.set(70,55,-90);scene.add(moon);
}

function personMesh(color=0x7cc7ff){const g=new THREE.Group();const body=new THREE.Mesh(new THREE.CapsuleGeometry(.18,.55,3,6),new THREE.MeshStandardMaterial({color,roughness:.85}));body.position.y=.56;body.castShadow=true;const head=new THREE.Mesh(new THREE.SphereGeometry(.15,8,8),new THREE.MeshStandardMaterial({color:0xd4ad85,roughness:.9}));head.position.y=1.12;head.castShadow=true;g.add(body,head);return g}
function buildGuests(){
  stationGuests=[];for(let i=0;i<42;i++){const p=personMesh(new THREE.Color().setHSL((i*.13)%1,.42,.58));p.position.set(-33+(i%7)*1.05,.6,8+Math.floor(i/7)*.8);scene.add(p);stationGuests.push(p)}
}
function buildTrains(){trainGroups=[];for(let t=0;t<3;t++){const g=new THREE.Group();for(let c=0;c<4;c++){const car=new THREE.Group();const shell=new THREE.Mesh(new THREE.BoxGeometry(1.65,.75,2.2),new THREE.MeshStandardMaterial({color:trainStates[t].color,metalness:.45,roughness:.25}));shell.position.y=.45;shell.castShadow=true;car.add(shell);const nose=new THREE.Mesh(new THREE.BoxGeometry(1.5,.35,.45),new THREE.MeshStandardMaterial({color:0x0f1820,metalness:.65,roughness:.22}));nose.position.set(0,.55,-1.25);car.add(nose);for(let s=-.45;s<=.45;s+=.9){const seat=new THREE.Mesh(new THREE.BoxGeometry(.42,.4,.34),new THREE.MeshStandardMaterial({color:0x101318}));seat.position.set(s,.76,.1);car.add(seat)}car.position.z=c*2.45;g.add(car)}scene.add(g);trainGroups.push(g)} }
function buildRain(){const count=900;const pos=new Float32Array(count*3);for(let i=0;i<count;i++){pos[i*3]=rand(-65,65);pos[i*3+1]=rand(5,65);pos[i*3+2]=rand(-65,65)}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));rainPoints=new THREE.Points(geo,new THREE.PointsMaterial({color:0xcfe8ff,size:.06,transparent:true,opacity:.55}));rainPoints.visible=false;scene.add(rainPoints)}

function animate(){if(!state.running)return;requestAnimationFrame(animate);const dt=Math.min(.05,clock.getDelta());if(!state.paused)update(dt);render(dt);updateUI();}
function update(dt){
  if(state.estop)return;
  state.shiftRemaining=Math.max(0,state.shiftRemaining-dt);if(state.shiftRemaining<=0){finishShift();return}
  const arrival=state.difficulty==='chaos'?1.4:state.difficulty==='operator'?.9:.56;state.queue=Math.min(180,state.queue+arrival*dt);
  if(state.entryOpen&&state.stationTrain>=0&&!state.restraintsLocked&&!state.exitOpen&&state.seated<state.capacity&&state.queue>=1){state.loadingTimer+=dt;if(state.loadingTimer>.33){state.loadingTimer=0;state.seated++;state.queue--;if(state.seated%6===0)playSfx('gate',.08,1.2)}}
  if(state.unloadTimer>0){state.unloadTimer-=dt;if(state.unloadTimer<=0){state.served+=state.seated;state.score+=state.seated*12;state.seated=0;state.restraintsLocked=false;state.exitOpen=true;log('Guests unloaded. Exit platform open.','good');playSfx('gate',.25)}}
  for(let i=0;i<trainStates.length;i++){const tr=trainStates[i];if(tr.mode==='course'){const p=trackCurve.getPointAt(tr.phase);const target=.018+clamp((18-p.y)*.0012,-.006,.018);tr.speed=lerp(tr.speed,target,dt*2.2);tr.phase+=tr.speed*dt;if(tr.phase>=1){tr.phase=.002;if(state.stationTrain<0){tr.mode='station';tr.speed=0;state.stationTrain=i;state.unloadTimer=1.7;playSfx('brake',.6);log(`Train ${i+1} arrived in station.`,'info')}else{tr.phase=.965;tr.mode='brake';tr.speed=0;playSfx('brake',.28)}}} else if(tr.mode==='brake'&&state.stationTrain<0){tr.mode='station';tr.phase=.002;state.stationTrain=i;state.unloadTimer=1.7;playSfx('brake',.45)}}
  state.nextEvent-=dt;if(state.nextEvent<=0){randomEvent();state.nextEvent=rand(state.difficulty==='chaos'?8:14,state.difficulty==='trainee'?32:23)}
  state.satisfaction=clamp(98-(state.queue-35)*.24-(state.rideHold?5:0)-(state.weather==='storm'?4:0),42,100);state.score=Math.max(0,Math.round(state.served*10+state.satisfaction*3+state.reliability*2-state.queue));
  updateGuests3D(dt);
}
function updateGuests3D(dt){const visible=Math.min(stationGuests.length,Math.round(state.queue/2.5));for(let i=0;i<stationGuests.length;i++){const p=stationGuests[i];p.visible=i<visible;if(!p.visible)continue;const row=Math.floor(i/7),col=i%7;const baseX=-33+col*1.02,baseZ=8+row*.82;p.position.x=baseX+Math.sin(performance.now()*.001+i)*.03;p.position.z=baseZ;p.rotation.y=Math.sin(performance.now()*.0007+i*.9)*.15}}
function render(dt){
  updateTrainTransforms();updateCamera(dt);updateWeather3D(dt);renderer.render(scene,camera);
}
function updateTrainTransforms(){for(let i=0;i<trainGroups.length;i++){const tr=trainStates[i],g=trainGroups[i];let phase=tr.phase;if(tr.mode==='station')phase=.003;const p=trackCurve.getPointAt(phase),tan=trackCurve.getTangentAt(phase).normalize();g.position.copy(p);g.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),tan);}}
function updateCamera(dt){const idx=state.cameraIndex;let target=new THREE.Vector3(-25,4,1),pos=new THREE.Vector3();if(idx===0){pos.set(-37,10,16);target.set(-25,3,1)}else if(idx===1){pos.set(12,9,39);target.set(10,11,8)}else if(idx===2){const tr=trainStates[1].mode==='course'?1:trainStates[0].mode==='course'?0:2;const p=trackCurve.getPointAt(trainStates[tr].phase),tan=trackCurve.getTangentAt(trainStates[tr].phase);pos.copy(p).add(new THREE.Vector3(0,2.8,0)).add(tan.clone().multiplyScalar(-7));target.copy(p).add(tan.clone().multiplyScalar(5))}else{pos.set(0,57,70);target.set(0,8,5)}camera.position.lerp(pos,1-Math.pow(.001,dt));const look=new THREE.Vector3();camera.getWorldDirection(look);camera.lookAt(target)}
function updateWeather3D(dt){if(rainPoints?.visible){const arr=rainPoints.geometry.attributes.position.array;for(let i=0;i<arr.length;i+=3){arr[i+1]-=dt*38;if(arr[i+1]<1){arr[i+1]=rand(35,65);arr[i]=rand(-65,65);arr[i+2]=rand(-65,65)}}rainPoints.geometry.attributes.position.needsUpdate=true}}
function resizeRenderer(){if(!renderer)return;const mount=$('webglMount'),w=mount.clientWidth,h=mount.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}

function toggleEntry(){if(blocked())return;if(state.restraintsLocked||state.exitOpen){reject('Entry gates unavailable.');return}state.entryOpen=!state.entryOpen;state.platformChecked=false;playSfx('gate',.35);log(`Entry gates ${state.entryOpen?'opened':'closed'}.`,state.entryOpen?'info':'good')}
function toggleExit(){if(blocked())return;if(state.seated>0){reject('Exit gates unavailable while guests are seated.');return}state.exitOpen=!state.exitOpen;if(state.exitOpen)state.entryOpen=false;state.platformChecked=false;playSfx('gate',.35);log(`Exit gates ${state.exitOpen?'opened':'closed'}.`,'info')}
function toggleRestraints(){if(blocked())return;if(state.entryOpen||state.exitOpen){reject('Close station gates first.');return}if(state.seated===0){reject('No guests seated.');return}state.restraintsLocked=!state.restraintsLocked;state.platformChecked=false;playSfx('restraint',.6);log(`Restraints ${state.restraintsLocked?'locked':'released'}.`,state.restraintsLocked?'good':'info')}
function platformCheck(){if(blocked())return;if(state.stationTrain<0||!state.restraintsLocked||state.entryOpen||state.exitOpen||state.seated<state.capacity){reject('Platform check conditions not met.');return}state.platformChecked=true;playSfx('dispatch',.18,1.4);log('Platform check complete. Dispatch available.','good')}
function toggleHold(){if(state.estop)return;state.rideHold=!state.rideHold;playSfx('warning',.24);log(`Ride hold ${state.rideHold?'applied':'released'}.`,state.rideHold?'bad':'good')}
function toggleEStop(){state.estop=!state.estop;playSfx('warning',.6,.85);log(state.estop?'Emergency stop applied. Simulation frozen.':'Emergency stop reset. Simulation resumed.',state.estop?'bad':'good')}
function canDispatch(){return !state.estop&&!state.rideHold&&state.stationTrain>=0&&state.seated===state.capacity&&state.restraintsLocked&&state.platformChecked&&!state.entryOpen&&!state.exitOpen}
function dispatch(){if(!canDispatch())return;const i=state.stationTrain,tr=trainStates[i],elapsed=state.shiftLength-state.shiftRemaining;if(state.lastDispatch!=null)state.dispatchTimes.push(elapsed-state.lastDispatch);state.lastDispatch=elapsed;state.stationTrain=-1;tr.mode='course';tr.phase=.018;tr.speed=.036;state.platformChecked=false;state.score+=150;playSfx('dispatch',.72);setTimeout(()=>playSfx('whoosh',.5),220);log(`Train ${i+1} dispatched.`,'good')}
function blocked(){return state.estop||state.rideHold||state.stationTrain<0}
function reject(msg){playSfx('warning',.22,1.15);log(msg,'bad')}
function randomEvent(){const r=Math.random();if(r<.34){state.weather=state.weather==='clear'?'rain':'clear';setWeather(state.weather);log(state.weather==='rain'?'Rain shower moving over the ride.':'Weather cleared.','info')}else if(r<.62){state.platformChecked=false;state.reliability=clamp(state.reliability-1,70,100);playSfx('warning',.18);log('Guest restraint recheck requested.','bad')}else if(r<.82){state.rideHold=true;state.reliability=clamp(state.reliability-2,70,100);playSfx('warning',.35);log('Automatic control hold: sensor disagreement.','bad');setTimeout(()=>{if(state.running&&!state.estop){state.rideHold=false;log('Control hold cleared.','good');playSfx('dispatch',.12,1.6)}},3500)}else{state.weather='storm';setWeather('storm');log('Storm cell nearby. Reduced operating conditions.','bad');setTimeout(()=>{if(state.running){state.weather='rain';setWeather('rain')}},6000)}}
function setWeather(type){$('weatherFx').className='weather-fx '+(type==='clear'?'':type);if(rainPoints)rainPoints.visible=type!=='clear';if(scene){scene.fog.density=type==='storm'?.014:type==='rain'?.011:.008;sunLight.intensity=type==='storm'?1.1:type==='rain'?1.6:2.5;hemiLight.intensity=type==='storm'?.85:type==='rain'?1.1:1.45}}
function cycleCamera(){state.cameraIndex=(state.cameraIndex+1)%CAMERA_MODES.length;$('cameraBtn').textContent='CAM '+(state.cameraIndex+1);$('cameraLabel').textContent=CAMERA_MODES[state.cameraIndex]}

function updateUI(){
  $('shiftTime').textContent=clockText(state.shiftRemaining);$('queueTop').textContent=Math.round(state.queue);$('queueNum').textContent=Math.round(state.queue);const elapsed=Math.max(1,state.shiftLength-state.shiftRemaining);$('tphTop').textContent=Math.round(state.served/(elapsed/3600));$('scoreTop').textContent=state.score;$('guestState').textContent=`${state.seated} / ${state.capacity}`;$('served').textContent=state.served;$('weatherState').textContent=state.weather.toUpperCase();$('reliability').textContent=Math.round(state.reliability)+'%';$('satisfaction').textContent=Math.round(state.satisfaction)+'%';$('satisfactionBar').style.width=state.satisfaction+'%';$('queueFill').style.width=clamp(state.queue/140*100,0,100)+'%';
  $('entryBtn').classList.toggle('on',state.entryOpen);$('exitBtn').classList.toggle('on',state.exitOpen);$('restraintsBtn').classList.toggle('on',state.restraintsLocked);$('checkBtn').classList.toggle('on',state.platformChecked);$('holdBtn').classList.toggle('warn',state.rideHold);$('dispatchBtn').disabled=!canDispatch();$('dispatchBtn').classList.toggle('ready',canDispatch());$('dispatchBtn').classList.toggle('on',canDispatch());$('dispatchHint').textContent=canDispatch()?'READY':'SEQUENCE INCOMPLETE';$('audioBtn').textContent=state.soundOn?'SOUND ON':'SOUND OFF';$('musicBtn').textContent=state.musicOn?'MUSIC ON':'MUSIC OFF';
  const ss=$('systemStatus');ss.className='system-status '+(state.estop?'fault':state.rideHold?'warn':'ready');ss.querySelector('span').textContent=state.estop?'E-STOP ACTIVE':state.rideHold?'RIDE HOLD':canDispatch()?'DISPATCH READY':'SYSTEM READY';
  $('trainState').textContent=state.stationTrain>=0?`TRAIN ${state.stationTrain+1} â STATION`:'STATION EMPTY';$('blockState').textContent=trainStates.filter(t=>t.mode==='course'||t.mode==='brake').length+' TRAINS ACTIVE';
  const target=state.stationTrain<0?'Await train':state.seated<state.capacity?'Load guests':state.entryOpen?'Close entry gates':!state.restraintsLocked?'Lock restraints':!state.platformChecked?'Complete platform check':'Dispatch train';$('nextTarget').textContent=target;$('missionText').textContent=canDispatch()?'Dispatch now to protect throughput.':'Fill the train, secure the platform and keep the queue moving.';
  const strip=$('guestStrip');const desired=Math.min(52,Math.round(state.queue/2.4));if(strip.children.length!==desired){strip.innerHTML='';for(let i=0;i<desired;i++)strip.appendChild(document.createElement('i'))}
}
function log(msg,type='info'){const row=document.createElement('div');row.className=type;row.textContent=`${clockText(state.shiftRemaining)}  ${msg}`;$('eventLog').prepend(row);while($('eventLog').children.length>11)$('eventLog').lastChild.remove()}
function clockText(s){s=Math.max(0,Math.ceil(s));return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`}
function finishShift(){if(!state.running)return;state.running=false;const grade=state.score>3500?'S':state.score>2850?'A':state.score>2150?'B':'C';const best=state.dispatchTimes.length?Math.min(...state.dispatchTimes):null;$('endTitle').textContent=`Grade ${grade}`;$('endText').textContent=`You served ${state.served} guests with ${Math.round(state.satisfaction)}% satisfaction and ${Math.round(state.reliability)}% reliability.`;$('endGuests').textContent=state.served;$('endScore').textContent=state.score;$('endDispatch').textContent=best?Math.round(best)+'s':'--';$('endModal').classList.remove('hidden');playSfx('dispatch',.55,1.25)}

function initHeroCanvas(){heroCtx=$('heroCanvas').getContext('2d')}
function animateHero(){const c=heroCtx,cv=$('heroCanvas');const r=cv.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2);if(cv.width!==Math.round(r.width*dpr)||cv.height!==Math.round(r.height*dpr)){cv.width=Math.round(r.width*dpr);cv.height=Math.round(r.height*dpr)}const w=cv.width,h=cv.height,t=performance.now()*.00035;c.clearRect(0,0,w,h);const grad=c.createLinearGradient(0,0,0,h);grad.addColorStop(0,'#132339');grad.addColorStop(1,'#04070b');c.fillStyle=grad;c.fillRect(0,0,w,h);c.strokeStyle='#6f849b';c.lineWidth=Math.max(2,w/650);c.beginPath();for(let i=0;i<=120;i++){const x=w*(i/120),y=h*(.62-Math.sin(i*.085)*.18-Math.sin(i*.031)*.07);i?c.lineTo(x,y):c.moveTo(x,y)}c.stroke();for(let i=0;i<18;i++){const x=w*(i/18),y=h*(.62-Math.sin(i*6.7*.085)*.18-Math.sin(i*6.7*.031)*.07);c.strokeStyle='rgba(120,145,170,.3)';c.beginPath();c.moveTo(x,y);c.lineTo(x,h*.86);c.stroke()}const x=(t%1)*w,y=h*(.62-Math.sin((t%1)*120*.085)*.18-Math.sin((t%1)*120*.031)*.07);c.fillStyle='#72e6ff';c.fillRect(x-12*dpr,y-6*dpr,24*dpr,12*dpr);c.fillStyle='rgba(255,255,255,.8)';c.font=`${12*dpr}px system-ui`;c.fillText('LIVE',18*dpr,25*dpr);requestAnimationFrame(animateHero)}
