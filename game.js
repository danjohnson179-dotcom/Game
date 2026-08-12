(function(){
'use strict';

const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rand=(a,b)=>a+Math.random()*(b-a);

const boot=$('boot'),bootText=$('bootText'),retryBtn=$('retryBtn'),game=$('game');
if(!window.THREE){
  bootText.textContent='3D library failed to load.';
  retryBtn.hidden=false;retryBtn.onclick=()=>location.reload();
  return;
}

let renderer,scene,camera,clock,curve;
const trains=[], trainStates=[], guests=[];
let stationTrain=0, cameraMode=0, running=false, paused=false;

const S={
 time:300,queue:36,seated:0,cap:24,served:0,score:0,tph:0,
 entry:false,exit:false,restraints:false,checked:false,hold:false,estop:false,
 weather:'CLEAR',reliability:100,satisfaction:98,lastDispatch:0,nextEvent:16
};

try{
 init3D();
 bindUI();
 updateUI();
 boot.classList.add('hidden');
 game.classList.remove('hidden');
 log('3D engine ready.','good');
}catch(e){
 console.error(e);
 boot.classList.remove('hidden');
 game.classList.add('hidden');
 bootText.textContent='Game startup failed: '+(e && e.message ? e.message : 'unknown error');
 retryBtn.hidden=false;retryBtn.onclick=()=>location.reload();
}

function init3D(){
 const mount=$('scene');
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
 renderer.setSize(innerWidth,innerHeight,false);
 renderer.shadowMap.enabled=true;
 renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;
 renderer.toneMappingExposure=1.05;
 mount.appendChild(renderer.domElement);

 scene=new THREE.Scene();
 scene.background=new THREE.Color(0x081321);
 scene.fog=new THREE.FogExp2(0x081321,.0085);

 camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.1,600);
 camera.position.set(-35,11,18);

 scene.add(new THREE.HemisphereLight(0x8bb1da,0x142018,1.4));
 const key=new THREE.DirectionalLight(0xdceaff,2.25);
 key.position.set(-28,42,18);key.castShadow=true;key.shadow.mapSize.set(1024,1024);scene.add(key);

 const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x173020,roughness:1}));
 ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);

 buildWorld();buildTrack();buildTrains();buildGuests();
 clock=new THREE.Clock();
 addEventListener('resize',resize);
 renderer.setAnimationLoop(loop);
}

function buildWorld(){
 const trunkMat=new THREE.MeshStandardMaterial({color:0x51351f});
 const treeMat=new THREE.MeshStandardMaterial({color:0x163b24,roughness:1});
 for(let i=0;i<55;i++){
  const a=Math.random()*Math.PI*2,r=35+Math.random()*50,x=Math.cos(a)*r,z=Math.sin(a)*r,s=.7+Math.random()*.7;
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.14*s,.21*s,2.3*s,6),trunkMat);trunk.position.set(x,1.15*s,z);scene.add(trunk);
  const crown=new THREE.Mesh(new THREE.ConeGeometry(1.3*s,3.8*s,8),treeMat);crown.position.set(x,3.4*s,z);crown.castShadow=true;scene.add(crown);
 }
 const st=new THREE.Group();
 const slab=new THREE.Mesh(new THREE.BoxGeometry(25,1,10),new THREE.MeshStandardMaterial({color:0x292f36,roughness:.7}));slab.position.y=.5;slab.receiveShadow=true;st.add(slab);
 const roof=new THREE.Mesh(new THREE.BoxGeometry(26,.7,11),new THREE.MeshStandardMaterial({color:0x111923,metalness:.6,roughness:.35}));roof.position.y=8.2;roof.castShadow=true;st.add(roof);
 const steel=new THREE.MeshStandardMaterial({color:0x737f89,metalness:.75,roughness:.35});
 [-11,-5,1,7,11].forEach(x=>[-4.3,4.3].forEach(z=>{const c=new THREE.Mesh(new THREE.BoxGeometry(.3,7.2,.3),steel);c.position.set(x,4.1,z);st.add(c)}));
 scene.add(st);
}

function buildTrack(){
 const pts=[[-11,2,-1],[6,2,-1],[18,3,-5],[30,12,-15],[23,25,-28],[7,32,-36],[-13,21,-31],[-24,8,-18],[-31,3,0],[-22,5,20],[-7,16,29],[15,11,25],[27,4,11],[14,2,2]].map(p=>new THREE.Vector3(...p));
 curve=new THREE.CatmullRomCurve3(pts,true,'catmullrom',.25);
 const rail=new THREE.Mesh(new THREE.TubeGeometry(curve,700,.16,8,true),new THREE.MeshStandardMaterial({color:0xb8202f,metalness:.82,roughness:.28}));
 rail.castShadow=true;scene.add(rail);
 const tieMat=new THREE.MeshStandardMaterial({color:0x424a53,metalness:.6,roughness:.5});
 const supMat=new THREE.MeshStandardMaterial({color:0x67717b,metalness:.72,roughness:.36});
 for(let i=0;i<180;i++){
  const t=i/180,p=curve.getPointAt(t),tan=curve.getTangentAt(t).normalize(),side=new THREE.Vector3().crossVectors(tan,new THREE.Vector3(0,1,0)).normalize();
  const tie=new THREE.Mesh(new THREE.BoxGeometry(1.75,.09,.12),tieMat);tie.position.copy(p);tie.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),side);scene.add(tie);
  if(i%7===0&&p.y>2.5){const h=p.y,sup=new THREE.Mesh(new THREE.CylinderGeometry(.08,.13,h,6),supMat);sup.position.set(p.x,h/2,p.z);scene.add(sup)}
 }
}

function buildTrains(){
 [0xd71f31,0x247dd8,0xf2a71b].forEach((color,idx)=>{
  const g=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color,metalness:.66,roughness:.24}),dark=new THREE.MeshStandardMaterial({color:0x151a20,roughness:.55});
  for(let c=0;c<5;c++){
   const body=new THREE.Mesh(new THREE.BoxGeometry(2.25,.8,1.45),mat);body.position.z=c*1.55;body.castShadow=true;g.add(body);
   const seat=new THREE.Mesh(new THREE.BoxGeometry(1.6,.46,1.05),dark);seat.position.set(0,.57,c*1.55);g.add(seat);
  }
  g.scale.set(.82,.82,.82);scene.add(g);trains.push(g);
 });
 trainStates.push({mode:'station',phase:.003,speed:0},{mode:'course',phase:.33,speed:.028},{mode:'course',phase:.66,speed:.029});
}

function buildGuests(){
 for(let i=0;i<45;i++){
  const g=new THREE.Group();
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.18,.5,4,6),new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(Math.random(),.55,.55)}));body.position.y=.9;g.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.15,8,6),new THREE.MeshStandardMaterial({color:0xd4a17b}));head.position.y=1.45;g.add(head);
  scene.add(g);guests.push(g);
 }
}

function bindUI(){
 $('playBtn').onclick=()=>{$('intro').classList.add('hidden');running=true;log('Shift started.','good')};
 $('againBtn').onclick=()=>location.reload();
 $('pauseBtn').onclick=()=>{paused=!paused;$('pauseBtn').textContent=paused?'RESUME':'PAUSE'};
 $('entryBtn').onclick=()=>{
  if(blocked())return reject('Entry unavailable.');
  if(S.exit||S.restraints)return reject('Close exit/release restraints first.');
  S.entry=!S.entry;S.checked=false;log('Entry gates '+(S.entry?'opened.':'closed.'));updateUI()
 };
 $('exitBtn').onclick=()=>{
  if(blocked())return reject('Exit unavailable.');
  if(S.entry)return reject('Close entry gates first.');
  S.exit=!S.exit;S.checked=false;log('Exit gates '+(S.exit?'opened.':'closed.'));updateUI()
 };
 $('restraintBtn').onclick=()=>{
  if(blocked())return reject('Restraints unavailable.');
  if(S.entry||S.exit)return reject('Close all gates first.');
  if(S.seated<23.5)return reject('Train is not fully loaded.');
  S.restraints=!S.restraints;S.checked=false;log('Restraints '+(S.restraints?'locked.':'released.'),S.restraints?'good':'');updateUI()
 };
 $('checkBtn').onclick=()=>{
  if(blocked())return reject('Platform check unavailable.');
  if(S.seated<23.5||!S.restraints||S.entry||S.exit)return reject('Platform conditions not met.');
  S.checked=true;log('Platform check complete.','good');updateUI()
 };
 $('holdBtn').onclick=()=>{if(S.estop)return;S.hold=!S.hold;log('Ride hold '+(S.hold?'applied.':'released.'),S.hold?'bad':'good');updateUI()};
 $('estopBtn').onclick=()=>{S.estop=!S.estop;log(S.estop?'Emergency stop active.':'Emergency stop reset.',S.estop?'bad':'good');updateUI()};
 $('dispatchBtn').onclick=dispatch;
 document.querySelectorAll('.cam').forEach(b=>b.onclick=()=>{cameraMode=Number(b.dataset.cam);document.querySelectorAll('.cam').forEach(x=>x.classList.toggle('active',x===b))});
}

function blocked(){return S.estop||S.hold||stationTrain<0}
function reject(m){log(m,'bad')}
function ready(){return !blocked()&&S.seated>=23.5&&!S.entry&&!S.exit&&S.restraints&&S.checked}

function dispatch(){
 if(!ready())return;
 const tr=trainStates[stationTrain],i=stationTrain;tr.mode='course';tr.phase=.018;tr.speed=.036;stationTrain=-1;
 S.checked=false;S.lastDispatch=300-S.time;S.score+=120;log('Train '+(i+1)+' dispatched.','good');updateUI()
}

function loop(){
 const dt=Math.min(clock.getDelta(),.05);
 if(running&&!paused&&!S.estop)tick(dt);
 updateTrains();updateCamera(dt);renderer.render(scene,camera);
}

function tick(dt){
 S.time-=dt;if(S.time<=0){S.time=0;finish();return}
 S.queue=clamp(S.queue+dt*.15,0,140);

 if(stationTrain>=0){
  if(S.exit&&S.seated>0){const u=Math.min(S.seated,dt*13);S.seated-=u;if(S.seated<.05){S.served+=24;S.seated=0}}
  if(S.entry&&!S.restraints){const b=Math.min(S.queue,24-S.seated,dt*9);S.seated+=b;S.queue-=b}
 }

 trainStates.forEach((tr,i)=>{
  if(tr.mode==='course'){
   tr.phase=(tr.phase+tr.speed*dt)%1;
   if(tr.phase<.022&&stationTrain<0){
    tr.mode='station';tr.phase=.003;tr.speed=0;stationTrain=i;S.entry=false;S.exit=false;S.restraints=false;S.checked=false;log('Train '+(i+1)+' arrived.','good')
   }
  }
 });

 S.nextEvent-=dt;if(S.nextEvent<=0){event();S.nextEvent=rand(18,28)}
 S.satisfaction=clamp(98-(S.queue-30)*.22-(S.hold?7:0),50,100);
 const elapsed=Math.max(1,300-S.time);S.tph=Math.round(S.served/(elapsed/3600));S.score=Math.round(S.served*10+S.satisfaction*2+S.reliability*2-S.queue);
 updateGuests();updateUI();
}

function event(){
 const r=Math.random();
 if(r<.45){S.weather=S.weather==='CLEAR'?'RAIN':'CLEAR';log('Weather changed: '+S.weather+'.')}
 else if(r<.72){S.checked=false;S.reliability=clamp(S.reliability-1,75,100);log('Restraint recheck requested.','bad')}
 else {S.hold=true;log('Automatic ride hold.','bad');setTimeout(()=>{if(running&&!S.estop){S.hold=false;log('Ride hold cleared.','good');updateUI()}},2600)}
}

function updateTrains(){
 trains.forEach((g,i)=>{
  const tr=trainStates[i],p=curve.getPointAt(tr.mode==='station'?.003:tr.phase),tan=curve.getTangentAt(tr.mode==='station'?.003:tr.phase).normalize();
  g.position.copy(p);g.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),tan);
 });
}

function updateGuests(){
 const vis=Math.min(guests.length,Math.round(S.queue/2.5));
 guests.forEach((g,i)=>{g.visible=i<vis;if(!g.visible)return;const row=Math.floor(i/7),col=i%7;g.position.set(-31+col*.8,0,7+row*.7);g.rotation.y=Math.sin(performance.now()*.001+i)*.12});
}

function updateCamera(dt){
 let pos=new THREE.Vector3(),look=new THREE.Vector3(0,7,0);
 if(cameraMode===0){pos.set(-34,10,17);look.set(-23,3,0)}
 else if(cameraMode===1){pos.set(15,11,38);look.set(7,10,6)}
 else if(cameraMode===2){
  let idx=trainStates.findIndex(t=>t.mode==='course');if(idx<0)idx=0;
  const tr=trainStates[idx],p=curve.getPointAt(tr.phase),tan=curve.getTangentAt(tr.phase).normalize();pos.copy(p).add(new THREE.Vector3(0,2.7,0)).add(tan.clone().multiplyScalar(-7));look.copy(p).add(tan.clone().multiplyScalar(5))
 }else{pos.set(0,54,68);look.set(0,8,3)}
 camera.position.lerp(pos,1-Math.pow(.001,dt));camera.lookAt(look);
}

function updateUI(){
 $('time').textContent=fmt(S.time);$('queue').textContent=Math.round(S.queue);$('tph').textContent=S.tph;$('score').textContent=Math.max(0,S.score);
 $('stationLabel').textContent=stationTrain>=0?'TRAIN '+(stationTrain+1):'EMPTY';
 $('guestsLabel').textContent=Math.floor(S.seated)+' / 24';$('restraintLabel').textContent=S.restraints?'LOCKED':'OPEN';$('platformLabel').textContent=S.checked?'CHECKED':'UNCHECKED';$('weatherLabel').textContent=S.weather;
 $('entryBtn').classList.toggle('on',S.entry);$('exitBtn').classList.toggle('on',S.exit);$('restraintBtn').classList.toggle('on',S.restraints);$('checkBtn').classList.toggle('on',S.checked);$('holdBtn').classList.toggle('warn',S.hold);
 $('dispatchBtn').disabled=!ready();$('dispatchBtn').querySelector('small').textContent=ready()?'READY':'BLOCKED';
 const lamp=$('readyLamp');lamp.className='readyLamp '+(S.estop?'fault':S.hold?'warn':'');lamp.querySelector('span').textContent=S.estop?'E-STOP ACTIVE':S.hold?'RIDE HOLD':ready()?'DISPATCH READY':'SYSTEM READY';
 const obj=stationTrain<0?'Wait for train':S.seated<23.5?'Load the train':S.entry?'Close entry gates':S.exit?'Close exit gates':!S.restraints?'Lock restraints':!S.checked?'Check platform':'Dispatch train';
 $('objective').textContent=obj;$('objectiveText').textContent=ready()?'Dispatch now to keep throughput high.':'Complete the station sequence safely.';
 $('queueFill').style.width=clamp(S.queue/140*100,2,100)+'%';
 const dots=$('queueDots'),n=Math.min(45,Math.round(S.queue/3));if(dots.children.length!==n){dots.innerHTML='';for(let i=0;i<n;i++)dots.appendChild(document.createElement('i'))}
}

function log(m,type=''){const d=document.createElement('div');d.className=type;d.textContent=fmt(S.time)+'  '+m;$('log').prepend(d);while($('log').children.length>9)$('log').lastChild.remove()}
function fmt(s){s=Math.max(0,Math.ceil(s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
function finish(){running=false;const grade=S.score>3000?'A':S.score>2200?'B':'C';$('grade').textContent='GRADE '+grade;$('result').textContent='You served '+S.served+' guests with a score of '+Math.max(0,S.score)+'.';$('finish').classList.remove('hidden')}
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}
})();
