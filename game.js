import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.183.1/build/three.module.js';
import { AudioSystem } from './audio.js';

const $ = id => document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand=(a,b)=>a+Math.random()*(b-a);
const audio=new AudioSystem();

const state={
  running:false,shiftLength:300,shiftRemaining:300,queue:42,seated:0,capacity:24,
  served:0,score:0,satisfaction:98,reliability:100,
  entryOpen:false,exitOpen:false,restraintsLocked:false,platformChecked:false,
  rideHold:false,estop:false,stationTrain:0,cameraIndex:0,
  soundOn:false,musicOn:false,weather:'clear',lastDispatch:null,dispatchTimes:[],
  nextEvent:18
};

const CAMERA_MODES=['STATION','TRACK','CHASE','AERIAL'];
let renderer,scene,camera,clock,trackCurve,trainGroups=[],trainStates=[],stationGuests=[];
let rainPoints,sunLight,hemiLight,heroCtx;

initScene();
initUI();
initHeroCanvas();
animateHero();
updateUI();
log('Operator console online.','good');

function initScene(){
  const mount=$('webglMount');
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(mount.clientWidth,mount.clientHeight,false);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.12;
  mount.appendChild(renderer.domElement);

  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x07111d);
  scene.fog=new THREE.FogExp2(0x07111d,.008);

  camera=new THREE.PerspectiveCamera(52,mount.clientWidth/mount.clientHeight,.1,700);
  camera.position.set(-37,10,16);

  hemiLight=new THREE.HemisphereLight(0x86a9d0,0x172018,1.45);scene.add(hemiLight);
  sunLight=new THREE.DirectionalLight(0xdde9ff,2.5);sunLight.position.set(-30,48,22);sunLight.castShadow=true;
  sunLight.shadow.mapSize.set(2048,2048);sunLight.shadow.camera.left=-85;sunLight.shadow.camera.right=85;sunLight.shadow.camera.top=85;sunLight.shadow.camera.bottom=-85;scene.add(sunLight);

  const ground=new THREE.Mesh(new THREE.PlaneGeometry(220,220),new THREE.MeshStandardMaterial({color:0x173020,roughness:.98}));
  ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);

  buildEnvironment();
  buildStation();
  buildTrack();
  buildTrains();
  buildGuests();
  buildRain();

  clock=new THREE.Clock();
  window.addEventListener('resize',resizeRenderer);
  renderer.setAnimationLoop(gameLoop);
}

function buildEnvironment(){
  const trunkMat=new THREE.MeshStandardMaterial({color:0x53371f,roughness:1});
  const leafMat=new THREE.MeshStandardMaterial({color:0x163d24,roughness:1});
  for(let i=0;i<85;i++){
    const a=Math.random()*Math.PI*2,r=37+Math.random()*62;
    const x=Math.cos(a)*r,z=Math.sin(a)*r,s=.65+Math.random()*.85;
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.16*s,.24*s,2.6*s,8),trunkMat);
    trunk.position.set(x,1.3*s,z);trunk.castShadow=true;scene.add(trunk);
    const crown=new THREE.Mesh(new THREE.ConeGeometry(1.45*s,4.2*s,10),leafMat);
    crown.position.set(x,3.9*s,z);crown.castShadow=true;scene.add(crown);
  }

  const hillMat=new THREE.MeshStandardMaterial({color:0x1f3a29,roughness:1});
  for(let i=0;i<12;i++){
    const hill=new THREE.Mesh(new THREE.SphereGeometry(rand(8,16),20,14,0,Math.PI*2,0,Math.PI/2),hillMat);
    const a=Math.random()*Math.PI*2,r=60+Math.random()*35;
    hill.scale.y=rand(.35,.7);hill.position.set(Math.cos(a)*r,-1,Math.sin(a)*r);hill.receiveShadow=true;scene.add(hill);
  }

  for(let i=0;i<18;i++){
    const lamp=new THREE.PointLight(0xffe8a3,rand(.7,1.5),14,2);
    const a=Math.random()*Math.PI*2,r=20+Math.random()*45;
    lamp.position.set(Math.cos(a)*r,3,Math.sin(a)*r);scene.add(lamp);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.05,.07,3,6),new THREE.MeshStandardMaterial({color:0x3f4851,metalness:.8}));
    pole.position.set(lamp.position.x,1.5,lamp.position.z);scene.add(pole);
  }
}

function buildStation(){
  const station=new THREE.Group();
  const slab=new THREE.Mesh(new THREE.BoxGeometry(26,1,11),new THREE.MeshStandardMaterial({color:0x292f36,roughness:.7,metalness:.2}));
  slab.position.y=.5;slab.receiveShadow=true;station.add(slab);
  const roof=new THREE.Mesh(new THREE.BoxGeometry(27,.7,12),new THREE.MeshStandardMaterial({color:0x101923,roughness:.35,metalness:.62}));
  roof.position.y=8.5;roof.castShadow=true;station.add(roof);
  const steel=new THREE.MeshStandardMaterial({color:0x7f8995,roughness:.35,metalness:.8});
  for(const x of [-12,-6,0,6,12])for(const z of [-4.7,4.7]){
    const col=new THREE.Mesh(new THREE.BoxGeometry(.35,7.7,.35),steel);col.position.set(x,4.25,z);col.castShadow=true;station.add(col);
  }

  const gateMat=new THREE.MeshStandardMaterial({color:0x1d2329,roughness:.5,metalness:.7});
  for(let i=0;i<8;i++){
    const gate=new THREE.Mesh(new THREE.BoxGeometry(.12,1.25,2.5),gateMat);
    gate.position.set(-10+i*2.8,1.65,4.5);station.add(gate);
  }

  const signMat=new THREE.MeshStandardMaterial({color:0x101820,emissive:0x0a4b67,emissiveIntensity:2});
  const sign=new THREE.Mesh(new THREE.BoxGeometry(8,.7,.18),signMat);sign.position.set(0,7.2,5.7);station.add(sign);
  scene.add(station);
}

function buildTrack(){
  const pts=[
    [-11,2,-1],[6,2,-1],[18,3,-5],[30,13,-15],[23,25,-29],[7,33,-37],
    [-13,21,-31],[-24,8,-18],[-31,3,0],[-22,5,20],[-7,16,29],[15,11,25],
    [28,4,11],[14,2,2]
  ].map(p=>new THREE.Vector3(...p));
  trackCurve=new THREE.CatmullRomCurve3(pts,true,'catmullrom',.25);

  const railMat=new THREE.MeshStandardMaterial({color:0xb9202f,roughness:.28,metalness:.84});
  const spine=new THREE.Mesh(new THREE.TubeGeometry(trackCurve,1200,.17,10,true),railMat);
  spine.castShadow=true;spine.receiveShadow=true;scene.add(spine);

  const tieMat=new THREE.MeshStandardMaterial({color:0x454b53,roughness:.48,metalness:.65});
  const supportMat=new THREE.MeshStandardMaterial({color:0x646e78,roughness:.35,metalness:.75});
  for(let i=0;i<280;i++){
    const t=i/280,p=trackCurve.getPointAt(t),tan=trackCurve.getTangentAt(t).normalize();
    const side=new THREE.Vector3().crossVectors(tan,new THREE.Vector3(0,1,0)).normalize();
    const tie=new THREE.Mesh(new THREE.BoxGeometry(1.9,.1,.13),tieMat);
    tie.position.copy(p);tie.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),side);tie.castShadow=true;scene.add(tie);
    if(i%8===0&&p.y>2.6){
      const h=p.y;
      const support=new THREE.Mesh(new THREE.CylinderGeometry(.09,.15,h,7),supportMat);
      support.position.set(p.x,h/2,p.z);support.castShadow=true;scene.add(support);
    }
  }
}

function buildTrains(){
  const colors=[0xd71f31,0x1f7bd8,0xffb522];
  for(let t=0;t<3;t++){
    const g=new THREE.Group();
    const bodyMat=new THREE.MeshStandardMaterial({color:colors[t],roughness:.22,metalness:.68});
    const seatMat=new THREE.MeshStandardMaterial({color:0x15191e,roughness:.55,metalness:.25});
    for(let c=0;c<6;c++){
      const body=new THREE.Mesh(new THREE.BoxGeometry(2.45,.9,1.6),bodyMat);body.position.z=c*1.72;body.castShadow=true;g.add(body);
      const seat=new THREE.Mesh(new THREE.BoxGeometry(1.8,.55,1.25),seatMat);seat.position.set(0,.65,c*1.72);seat.castShadow=true;g.add(seat);
      const bar=new THREE.Mesh(new THREE.TorusGeometry(.55,.07,8,16,Math.PI),new THREE.MeshStandardMaterial({color:0x8c949d,metalness:.8,roughness:.3}));
      bar.rotation.z=Math.PI/2;bar.position.set(0,1.05,c*1.72);g.add(bar);
    }
    g.scale.set(.82,.82,.82);scene.add(g);trainGroups.push(g);
  }
  trainStates=[
    {mode:'station',phase:.003,speed:0},
    {mode:'course',phase:.34,speed:.026},
    {mode:'course',phase:.67,speed:.028}
  ];
}

function makeGuest(){
  const g=new THREE.Group();
  const shirt=new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(Math.random(),.58,.52),roughness:.85});
  const skin=new THREE.MeshStandardMaterial({color:0xd9a47c,roughness:.9});
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.20,.58,4,8),shirt);body.position.y=1.0;body.castShadow=true;g.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.18,10,8),skin);head.position.y=1.62;head.castShadow=true;g.add(head);
  return g;
}

function buildGuests(){
  for(let i=0;i<60;i++){
    const g=makeGuest();stationGuests.push(g);scene.add(g);
  }
}

function buildRain(){
  const count=1500,pos=new Float32Array(count*3);
  for(let i=0;i<count;i++){pos[i*3]=rand(-65,65);pos[i*3+1]=rand(2,65);pos[i*3+2]=rand(-65,65)}
  const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.BufferAttribute(pos,3));
  rainPoints=new THREE.Points(geom,new THREE.PointsMaterial({color:0xb9d8ff,size:.07,transparent:true,opacity:.65}));
  rainPoints.visible=false;scene.add(rainPoints);
}

function initUI(){
  $('startBtn').onclick=()=>startShift(false);
  $('startSoundBtn').onclick=()=>startShift(true);
  $('restartBtn').onclick=()=>location.reload();

  $('audioBtn').onclick=async()=>{
    await audio.init();state.soundOn=true;$('audioBtn').textContent='SOUND ON';log('Audio system enabled.','good');
  };
  $('musicBtn').onclick=async()=>{
    if(!state.musicOn){await audio.enableMusic();state.musicOn=true;$('musicBtn').textContent='MUSIC ON'}
    else{audio.disableMusic();state.musicOn=false;$('musicBtn').textContent='MUSIC OFF'}
  };

  $('entryBtn').onclick=toggleEntry;
  $('exitBtn').onclick=toggleExit;
  $('restraintsBtn').onclick=toggleRestraints;
  $('checkBtn').onclick=platformCheck;
  $('holdBtn').onclick=toggleHold;
  $('dispatchBtn').onclick=dispatch;
  $('estopBtn').onclick=toggleEStop;

  document.querySelectorAll('.cam').forEach(btn=>btn.onclick=()=>{
    state.cameraIndex=Number(btn.dataset.cam);
    document.querySelectorAll('.cam').forEach(b=>b.classList.toggle('active',b===btn));
  });
}

async function startShift(withSound){
  $('startScreen').classList.add('hidden');state.running=true;
  if(withSound){await audio.init();await audio.enableMusic();state.soundOn=true;state.musicOn=true}
  log('Shift started. Iron Comet open.','good');updateUI();
}

function gameLoop(){
  const dt=Math.min(clock.getDelta(),.05);
  updateSimulation(dt);
  updateTrainTransforms();
  updateCamera(dt);
  updateWeather3D(dt);
  renderer.render(scene,camera);
}

function updateSimulation(dt){
  if(!state.running||state.estop)return;
  state.shiftRemaining-=dt;if(state.shiftRemaining<=0){state.shiftRemaining=0;finishShift();return}

  state.queue=clamp(state.queue+dt*rand(.12,.28),0,150);
  state.nextEvent-=dt;if(state.nextEvent<=0){randomEvent();state.nextEvent=rand(18,34)}

  if(state.stationTrain>=0){
    if(state.exitOpen&&state.seated>0){
      const unload=Math.min(state.seated,dt*18);state.seated-=unload;
      if(state.seated<.1){state.seated=0;state.served+=state.capacity;audio.play('crowd',.15,1)}
    }
    if(state.entryOpen&&!state.restraintsLocked){
      const board=Math.min(state.queue,state.capacity-state.seated,dt*10);
      state.seated+=board;state.queue-=board;
    }
  }

  trainStates.forEach((tr,i)=>{
    if(tr.mode==='course'){
      tr.phase=(tr.phase+tr.speed*dt)%1;
      if(tr.phase>.945&&tr.phase<.985)audio.play('brake',.08,1.1);
      if(tr.phase<.025&&state.stationTrain<0){
        tr.mode='station';tr.phase=.003;tr.speed=0;state.stationTrain=i;
        state.entryOpen=false;state.exitOpen=false;state.restraintsLocked=false;state.platformChecked=false;
        log(`Train ${i+1} arrived in station.`,'good');audio.play('brake',.42);
      }
    }
  });

  state.satisfaction=clamp(98-(state.queue-35)*.24-(state.rideHold?5:0)-(state.weather==='storm'?4:0),42,100);
  state.score=Math.max(0,Math.round(state.served*10+state.satisfaction*3+state.reliability*2-state.queue));
  updateGuests3D();
  updateUI();
}

function updateGuests3D(){
  const visible=Math.min(stationGuests.length,Math.round(state.queue/2.4));
  for(let i=0;i<stationGuests.length;i++){
    const p=stationGuests[i];p.visible=i<visible;if(!p.visible)continue;
    const row=Math.floor(i/7),col=i%7;
    const baseX=-33+col*1.02,baseZ=8+row*.82;
    p.position.x=baseX+Math.sin(performance.now()*.001+i)*.03;
    p.position.z=baseZ;p.rotation.y=Math.sin(performance.now()*.0007+i*.9)*.15;
  }
}

function updateTrainTransforms(){
  for(let i=0;i<trainGroups.length;i++){
    const tr=trainStates[i],g=trainGroups[i],phase=tr.mode==='station'?.003:tr.phase;
    const p=trackCurve.getPointAt(phase),tan=trackCurve.getTangentAt(phase).normalize();
    g.position.copy(p);g.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),tan);
  }
}

function updateCamera(dt){
  let target=new THREE.Vector3(-25,4,1),pos=new THREE.Vector3();
  if(state.cameraIndex===0){pos.set(-37,10,16);target.set(-25,3,1)}
  else if(state.cameraIndex===1){pos.set(12,10,39);target.set(10,11,8)}
  else if(state.cameraIndex===2){
    const idx=trainStates.findIndex(t=>t.mode==='course');
    const tr=idx>=0?idx:0,p=trackCurve.getPointAt(trainStates[tr].phase),tan=trackCurve.getTangentAt(trainStates[tr].phase);
    pos.copy(p).add(new THREE.Vector3(0,2.8,0)).add(tan.clone().multiplyScalar(-7));
    target.copy(p).add(tan.clone().multiplyScalar(5));
  }else{pos.set(0,57,70);target.set(0,8,5)}
  camera.position.lerp(pos,1-Math.pow(.001,dt));camera.lookAt(target);
}

function updateWeather3D(dt){
  if(rainPoints?.visible){
    const arr=rainPoints.geometry.attributes.position.array;
    for(let i=0;i<arr.length;i+=3){arr[i+1]-=dt*38;if(arr[i+1]<1){arr[i+1]=rand(35,65);arr[i]=rand(-65,65);arr[i+2]=rand(-65,65)}}
    rainPoints.geometry.attributes.position.needsUpdate=true;
  }
}

function toggleEntry(){
  if(blocked())return;
  if(state.restraintsLocked||state.exitOpen){reject('Entry gates unavailable.');return}
  state.entryOpen=!state.entryOpen;state.platformChecked=false;audio.play('gate',.35);log(`Entry gates ${state.entryOpen?'opened':'closed'}.`,'info');
}
function toggleExit(){
  if(blocked())return;
  if(state.entryOpen){reject('Close entry gates first.');return}
  state.exitOpen=!state.exitOpen;state.platformChecked=false;audio.play('gate',.35);log(`Exit gates ${state.exitOpen?'opened':'closed'}.`,'info');
}
function toggleRestraints(){
  if(blocked())return;
  if(state.entryOpen||state.exitOpen){reject('Close station gates first.');return}
  if(state.seated<state.capacity){reject('Train is not fully loaded.');return}
  state.restraintsLocked=!state.restraintsLocked;state.platformChecked=false;audio.play('restraint',.6);log(`Restraints ${state.restraintsLocked?'locked':'released'}.`,state.restraintsLocked?'good':'info');
}
function platformCheck(){
  if(blocked())return;
  if(state.stationTrain<0||!state.restraintsLocked||state.entryOpen||state.exitOpen||state.seated<state.capacity){reject('Platform check conditions not met.');return}
  state.platformChecked=true;audio.play('dispatch',.18,1.4);log('Platform check complete. Dispatch available.','good');
}
function toggleHold(){
  if(state.estop)return;state.rideHold=!state.rideHold;audio.play('warning',.24);
  log(`Ride hold ${state.rideHold?'applied':'released'}.`,state.rideHold?'bad':'good');updateUI();
}
function toggleEStop(){
  state.estop=!state.estop;audio.play('warning',.6,.85);
  log(state.estop?'Emergency stop applied. Simulation frozen.':'Emergency stop reset. Simulation resumed.',state.estop?'bad':'good');updateUI();
}
function canDispatch(){
  return !state.estop&&!state.rideHold&&state.stationTrain>=0&&state.seated>=state.capacity-.05&&state.restraintsLocked&&state.platformChecked&&!state.entryOpen&&!state.exitOpen;
}
function dispatch(){
  if(!canDispatch())return;
  const i=state.stationTrain,tr=trainStates[i],elapsed=state.shiftLength-state.shiftRemaining;
  if(state.lastDispatch!=null)state.dispatchTimes.push(elapsed-state.lastDispatch);
  state.lastDispatch=elapsed;state.stationTrain=-1;tr.mode='course';tr.phase=.018;tr.speed=.036;
  state.platformChecked=false;state.score+=150;audio.play('dispatch',.72);setTimeout(()=>audio.play('whoosh',.5),220);
  log(`Train ${i+1} dispatched.`,'good');updateUI();
}
function blocked(){return state.estop||state.rideHold||state.stationTrain<0}
function reject(msg){audio.play('warning',.22,1.15);log(msg,'bad')}
function randomEvent(){
  const r=Math.random();
  if(r<.34){
    state.weather=state.weather==='clear'?'rain':'clear';setWeather(state.weather);
    log(state.weather==='rain'?'Rain shower moving over the ride.':'Weather cleared.','info');
  }else if(r<.62){
    state.platformChecked=false;state.reliability=clamp(state.reliability-1,70,100);audio.play('warning',.18);log('Guest restraint recheck requested.','bad');
  }else if(r<.82){
    state.rideHold=true;state.reliability=clamp(state.reliability-2,70,100);audio.play('warning',.35);log('Automatic control hold: sensor disagreement.','bad');
    setTimeout(()=>{if(state.running&&!state.estop){state.rideHold=false;log('Control hold cleared.','good');audio.play('dispatch',.12,1.6);updateUI()}},3500);
  }else{
    state.weather='storm';setWeather('storm');log('Storm cell nearby. Reduced operating conditions.','bad');
    setTimeout(()=>{if(state.running){state.weather='rain';setWeather('rain')}},6000);
  }
}
function setWeather(type){
  $('weatherFx').className=type==='clear'?'':type;
  rainPoints.visible=type!=='clear';
  scene.fog.density=type==='storm'?.014:type==='rain'?.011:.008;
  sunLight.intensity=type==='storm'?1.1:type==='rain'?1.6:2.5;
  hemiLight.intensity=type==='storm'?.85:type==='rain'?1.1:1.45;
}

function updateUI(){
  $('shiftTime').textContent=clockText(state.shiftRemaining);
  $('queueTop').textContent=Math.round(state.queue);$('queueNum').textContent=Math.round(state.queue);
  const elapsed=Math.max(1,state.shiftLength-state.shiftRemaining);
  $('tphTop').textContent=Math.round(state.served/(elapsed/3600));$('scoreTop').textContent=state.score;
  $('guestState').textContent=`${Math.floor(state.seated)} / ${state.capacity}`;
  $('weatherState').textContent=state.weather.toUpperCase();
  $('reliability').textContent=Math.round(state.reliability)+'%';$('satisfaction').textContent=Math.round(state.satisfaction)+'%';
  $('satisfactionBar').style.width=state.satisfaction+'%';$('queueFill').style.width=clamp(state.queue/140*100,0,100)+'%';

  $('entryBtn').classList.toggle('on',state.entryOpen);$('exitBtn').classList.toggle('on',state.exitOpen);
  $('restraintsBtn').classList.toggle('on',state.restraintsLocked);$('checkBtn').classList.toggle('on',state.platformChecked);
  $('holdBtn').classList.toggle('warn',state.rideHold);$('dispatchBtn').disabled=!canDispatch();
  $('dispatchHint').textContent=canDispatch()?'READY':'SEQUENCE INCOMPLETE';

  const ss=$('systemStatus');ss.className='system-status '+(state.estop?'fault':state.rideHold?'warn':'ready');
  ss.querySelector('span').textContent=state.estop?'E-STOP ACTIVE':state.rideHold?'RIDE HOLD':canDispatch()?'DISPATCH READY':'SYSTEM READY';

  $('trainState').textContent=state.stationTrain>=0?`TRAIN ${state.stationTrain+1} â STATION`:'STATION EMPTY';
  $('blockState').textContent=trainStates.filter(t=>t.mode==='course').length+' TRAINS ACTIVE';

  const target=state.stationTrain<0?'Await train':state.seated<state.capacity?'Load guests':state.entryOpen?'Close entry gates':!state.restraintsLocked?'Lock restraints':!state.platformChecked?'Complete platform check':'Dispatch train';
  $('nextTarget').textContent=target;
  $('missionText').textContent=canDispatch()?'Dispatch now to protect throughput.':'Fill the train, secure the platform and keep the queue moving.';

  const strip=$('guestStrip'),desired=Math.min(52,Math.round(state.queue/2.4));
  if(strip.children.length!==desired){strip.innerHTML='';for(let i=0;i<desired;i++)strip.appendChild(document.createElement('i'))}
}

function log(msg,type='info'){
  const row=document.createElement('div');row.className=type;row.textContent=`${clockText(state.shiftRemaining)}  ${msg}`;
  $('eventLog').prepend(row);while($('eventLog').children.length>11)$('eventLog').lastChild.remove();
}
function clockText(s){s=Math.max(0,Math.ceil(s));return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`}
function finishShift(){
  if(!state.running)return;state.running=false;
  const grade=state.score>3500?'S':state.score>2850?'A':state.score>2150?'B':'C';
  const best=state.dispatchTimes.length?Math.min(...state.dispatchTimes):null;
  $('endTitle').textContent=`Grade ${grade}`;
  $('endText').textContent=`You served ${state.served} guests with ${Math.round(state.satisfaction)}% satisfaction and ${Math.round(state.reliability)}% reliability.`;
  $('endGuests').textContent=state.served;$('endScore').textContent=state.score;$('endDispatch').textContent=best?Math.round(best)+'s':'--';
  $('endModal').classList.remove('hidden');audio.play('dispatch',.55,1.25);
}
function resizeRenderer(){
  const mount=$('webglMount'),w=mount.clientWidth,h=mount.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
}

function initHeroCanvas(){heroCtx=$('heroCanvas').getContext('2d')}
function animateHero(){
  const c=heroCtx,cv=$('heroCanvas'),r=cv.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2);
  if(cv.width!==Math.round(r.width*dpr)||cv.height!==Math.round(r.height*dpr)){cv.width=Math.round(r.width*dpr);cv.height=Math.round(r.height*dpr)}
  const w=cv.width,h=cv.height,t=performance.now()*.00035;c.clearRect(0,0,w,h);
  const grad=c.createLinearGradient(0,0,0,h);grad.addColorStop(0,'#132339');grad.addColorStop(1,'#04070b');c.fillStyle=grad;c.fillRect(0,0,w,h);
  c.strokeStyle='#6f849b';c.lineWidth=Math.max(2,w/650);c.beginPath();
  for(let i=0;i<=120;i++){const x=w*(i/120),y=h*(.62-Math.sin(i*.085)*.18-Math.sin(i*.031)*.07);i?c.lineTo(x,y):c.moveTo(x,y)}c.stroke();
  const x=(t%1)*w,y=h*(.62-Math.sin((t%1)*120*.085)*.18-Math.sin((t%1)*120*.031)*.07);c.fillStyle='#72e6ff';c.fillRect(x-12*dpr,y-6*dpr,24*dpr,12*dpr);
  requestAnimationFrame(animateHero);
}
