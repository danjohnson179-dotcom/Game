(function(){
'use strict';
const $=id=>document.getElementById(id),
      clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),
      rand=(a,b)=>a+Math.random()*(b-a),
      on=(id,event,fn)=>{const el=$(id); if(el) el.addEventListener(event,fn); return el;};
const boot=$('boot'), game=$('game');
if(!window.THREE){$('bootText').textContent='3D engine failed to load.';$('retry').hidden=false;$('retry').onclick=()=>location.reload();return}

let renderer,scene,camera,clock,curve,stationGroup,entryGateMeshes=[],exitGateMeshes=[],trainGroups=[],trainStates=[],guestMeshes=[],cameraMode=0;
let running=false,paused=false,stationTrain=0,dualA=false,dualB=false;

const S={time:300,queue:44,seated:0,cap:24,served:0,tph:0,score:0,entry:false,exit:false,restraints:false,checked:false,hold:false,estop:false,reliability:100,nextEvent:22};

try{init3D();bindUI();updateUI();boot.classList.add('hidden');game.classList.remove('hidden');log('V7.1 operator simulator ready.','good')}
catch(e){console.error(e);$('bootText').textContent='Startup failed: '+e.message;$('retry').hidden=false;$('retry').onclick=()=>location.reload()}

function init3D(){
 const mount=$('scene');
 renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setSize(innerWidth,innerHeight,false);
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.07;mount.appendChild(renderer.domElement);

 scene=new THREE.Scene();scene.background=new THREE.Color(0x07111c);scene.fog=new THREE.FogExp2(0x07111c,.0075);
 camera=new THREE.PerspectiveCamera(53,innerWidth/innerHeight,.1,700);camera.position.set(-25,7,13);
 scene.add(new THREE.HemisphereLight(0x91b5da,0x182219,1.45));
 const sun=new THREE.DirectionalLight(0xe5efff,2.35);sun.position.set(-32,45,22);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);scene.add(sun);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(220,220),new THREE.MeshStandardMaterial({color:0x173221,roughness:1}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);

 buildScenery();buildStation();buildTrack();buildTrains();buildGuests();
 clock=new THREE.Clock();addEventListener('resize',resize);renderer.setAnimationLoop(loop);
}

function buildScenery(){
 const trunkMat=new THREE.MeshStandardMaterial({color:0x54371f}),leafMat=new THREE.MeshStandardMaterial({color:0x173f25,roughness:1});
 for(let i=0;i<70;i++){const a=Math.random()*Math.PI*2,r=38+Math.random()*60,x=Math.cos(a)*r,z=Math.sin(a)*r,s=.65+Math.random()*.7;
  const t=new THREE.Mesh(new THREE.CylinderGeometry(.14*s,.22*s,2.4*s,6),trunkMat);t.position.set(x,1.2*s,z);scene.add(t);
  const c=new THREE.Mesh(new THREE.ConeGeometry(1.35*s,4*s,8),leafMat);c.position.set(x,3.5*s,z);c.castShadow=true;scene.add(c)}
}

function buildStation(){
 stationGroup=new THREE.Group();
 const concrete=new THREE.MeshStandardMaterial({color:0x30363d,roughness:.75}),steel=new THREE.MeshStandardMaterial({color:0x7b8792,metalness:.78,roughness:.34}),dark=new THREE.MeshStandardMaterial({color:0x111920,metalness:.5,roughness:.4});
 const slab=new THREE.Mesh(new THREE.BoxGeometry(30,1,14),concrete);slab.position.set(-1,.5,0);slab.receiveShadow=true;stationGroup.add(slab);
 const pit=new THREE.Mesh(new THREE.BoxGeometry(25,.4,4),new THREE.MeshStandardMaterial({color:0x080b0f}));pit.position.set(-1,.95,0);stationGroup.add(pit);
 const roof=new THREE.Mesh(new THREE.BoxGeometry(31,.75,15),dark);roof.position.set(-1,9.2,0);roof.castShadow=true;stationGroup.add(roof);
 for(const x of [-14,-9,-4,1,6,11,14])for(const z of [-6,6]){const p=new THREE.Mesh(new THREE.BoxGeometry(.32,8.2,.32),steel);p.position.set(x,4.7,z);p.castShadow=true;stationGroup.add(p)}
 for(let i=0;i<10;i++){
  const beam=new THREE.Mesh(new THREE.BoxGeometry(.14,.14,13.8),steel);beam.position.set(-13.5+i*3,8.65,0);stationGroup.add(beam)
 }
 // control booth
 const booth=new THREE.Mesh(new THREE.BoxGeometry(4.2,3.6,3.4),new THREE.MeshStandardMaterial({color:0x1b252e,metalness:.35,roughness:.45}));booth.position.set(-11,2.7,-5.2);booth.castShadow=true;stationGroup.add(booth);
 const glass=new THREE.Mesh(new THREE.BoxGeometry(3.5,1.6,.08),new THREE.MeshStandardMaterial({color:0x4d7388,transparent:true,opacity:.55,metalness:.3}));glass.position.set(-11,3.2,-3.46);stationGroup.add(glass);

 // entry/exit swing gates
 const gateMat=new THREE.MeshStandardMaterial({color:0xe4c65a,metalness:.6,roughness:.38});
 for(let i=0;i<8;i++){
  const eg=new THREE.Group();const post=new THREE.Mesh(new THREE.BoxGeometry(.12,1.5,.12),steel);post.position.y=.75;eg.add(post);
  const arm=new THREE.Mesh(new THREE.BoxGeometry(.1,.85,2.5),gateMat);arm.position.set(0,.78,1.2);eg.add(arm);eg.position.set(-10+i*2.8,1,-5.8);stationGroup.add(eg);entryGateMeshes.push(eg);
  const xg=eg.clone();xg.position.z=5.8;stationGroup.add(xg);exitGateMeshes.push(xg);
 }
 // station lighting
 for(let i=0;i<7;i++){const l=new THREE.PointLight(0xfff1c6,.75,16,2);l.position.set(-12+i*4,7.8,0);stationGroup.add(l)}
 scene.add(stationGroup);
}

function buildTrack(){
 // station, lift, drop, turnaround, airtime, final brake
 const pts=[
  [-13,2,0],[-2,2,0],[11,2,-1],[22,5,-8],[30,17,-16],[24,31,-26],[8,37,-31],[-9,29,-29],[-20,11,-20],[-28,4,-7],
  [-26,3,8],[-16,7,21],[-3,15,27],[12,18,23],[25,10,14],[31,4,3],[22,3,-3],[10,2,0]
 ].map(p=>new THREE.Vector3(...p));
 curve=new THREE.CatmullRomCurve3(pts,true,'catmullrom',.2);

 const railMat=new THREE.MeshStandardMaterial({color:0xc42031,metalness:.85,roughness:.26});
 const spine=new THREE.Mesh(new THREE.TubeGeometry(curve,1000,.18,10,true),railMat);spine.castShadow=true;scene.add(spine);

 const tieMat=new THREE.MeshStandardMaterial({color:0x4b5158,metalness:.62,roughness:.46}),supMat=new THREE.MeshStandardMaterial({color:0x6d7781,metalness:.74,roughness:.36});
 for(let i=0;i<230;i++){
  const t=i/230,p=curve.getPointAt(t),tan=curve.getTangentAt(t).normalize(),side=new THREE.Vector3().crossVectors(tan,new THREE.Vector3(0,1,0)).normalize();
  const tie=new THREE.Mesh(new THREE.BoxGeometry(1.95,.1,.14),tieMat);tie.position.copy(p);tie.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),side);scene.add(tie);
  if(i%7===0&&p.y>2.6){const h=p.y,sup=new THREE.Mesh(new THREE.CylinderGeometry(.09,.15,h,7),supMat);sup.position.set(p.x,h/2,p.z);scene.add(sup)}
 }
 // lift chain visual
 for(let i=0;i<16;i++){const p=curve.getPointAt(.08+i*.006);const tooth=new THREE.Mesh(new THREE.BoxGeometry(.28,.08,.28),new THREE.MeshStandardMaterial({color:0xe7c85e,metalness:.7}));tooth.position.copy(p);tooth.position.y+=.15;scene.add(tooth)}
}

function buildTrains(){
 const colors=[0xe12638,0x2b7ed8,0xf0b026];
 colors.forEach((color,idx)=>{
  const g=new THREE.Group(),bodyMat=new THREE.MeshStandardMaterial({color,metalness:.68,roughness:.22}),seatMat=new THREE.MeshStandardMaterial({color:0x11171e,roughness:.55}),barMat=new THREE.MeshStandardMaterial({color:0x8d98a2,metalness:.8,roughness:.3});
  for(let c=0;c<6;c++){
   const body=new THREE.Mesh(new THREE.BoxGeometry(2.35,.85,1.55),bodyMat);body.position.z=c*1.62;body.castShadow=true;g.add(body);
   const nose=new THREE.Mesh(new THREE.BoxGeometry(1.75,.36,1.18),seatMat);nose.position.set(0,.62,c*1.62);g.add(nose);
   const bar=new THREE.Mesh(new THREE.TorusGeometry(.5,.05,8,16,Math.PI),barMat);bar.rotation.z=Math.PI/2;bar.position.set(0,1.04,c*1.62);g.add(bar);
  }
  g.scale.set(.82,.82,.82);scene.add(g);trainGroups.push(g);
 });
 trainStates.push(
  {mode:'station',phase:.002,speed:0,block:'STATION'},
  {mode:'course',phase:.43,speed:.027,block:'MID'},
  {mode:'course',phase:.82,speed:.025,block:'FINAL'}
 );
}

function buildGuests(){
 for(let i=0;i<70;i++){
  const g=new THREE.Group(),shirt=new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(Math.random(),.55,.55),roughness:.85}),skin=new THREE.MeshStandardMaterial({color:0xd7a27b,roughness:.9});
  const b=new THREE.Mesh(new THREE.CapsuleGeometry(.19,.55,4,7),shirt);b.position.y=.95;g.add(b);const h=new THREE.Mesh(new THREE.SphereGeometry(.16,9,7),skin);h.position.y=1.52;g.add(h);
  scene.add(g);guestMeshes.push(g);
 }
}

function bindUI(){
 on('play','click',()=>{const intro=$('intro');if(intro)intro.classList.add('hidden');running=true;log('Shift started.','good')});
 on('again','click',()=>location.reload());
 on('pause','click',()=>{paused=!paused;const p=$('pause');if(p)p.textContent=paused?'RESUME':'PAUSE'});
 on('entryBtn','click',()=>{if(blocked())return reject('Entry gates unavailable.');if(S.exit||S.restraints)return reject('Station interlock prevents entry gates.');S.entry=!S.entry;S.checked=false;log('Entry gates '+(S.entry?'opened.':'closed.'));updateUI()});
 on('exitBtn','click',()=>{if(blocked())return reject('Exit gates unavailable.');if(S.entry)return reject('Close entry gates first.');S.exit=!S.exit;S.checked=false;log('Exit gates '+(S.exit?'opened.':'closed.'));updateUI()});
 on('restraintBtn','click',()=>{if(blocked())return reject('Restraints unavailable.');if(S.entry||S.exit)return reject('Close station gates first.');if(S.seated<23.5)return reject('Train is not fully loaded.');S.restraints=!S.restraints;S.checked=false;log('Restraints '+(S.restraints?'locked.':'released.'),S.restraints?'good':'');updateUI()});
 on('checkBtn','click',()=>{if(blocked())return reject('Check unavailable.');if(S.seated<23.5||!S.restraints||S.entry||S.exit)return reject('Platform not ready.');S.checked=true;log('Platform check complete.','good');updateUI()});
 on('holdBtn','click',()=>{if(S.estop)return;S.hold=!S.hold;log('Ride hold '+(S.hold?'applied.':'released.'),S.hold?'bad':'good');updateUI()});
 on('estop','click',()=>{S.estop=!S.estop;log(S.estop?'Emergency stop active.':'Emergency stop reset.',S.estop?'bad':'good');updateUI()});
 on('dispatchA','click',()=>{dualA=true;checkDual()});
 on('dispatchB','click',()=>{dualB=true;checkDual()});
 document.querySelectorAll('.cam').forEach(b=>b.addEventListener('click',()=>{cameraMode=Number(b.dataset.cam);document.querySelectorAll('.cam').forEach(x=>x.classList.toggle('active',x===b))}));
}

function checkDual(){if(!ready()){dualA=dualB=false;return}if(dualA&&dualB){dispatch();dualA=dualB=false}else setTimeout(()=>{dualA=dualB=false},900)}
function blocked(){return S.estop||S.hold||stationTrain<0}
function ready(){return !blocked()&&S.seated>=23.5&&!S.entry&&!S.exit&&S.restraints&&S.checked&&blockClear('LIFT')}
function blockClear(name){return !trainStates.some(t=>t.mode==='course'&&t.block===name)}
function reject(m){log(m,'bad')}

function dispatch(){
 if(!ready())return;
 const i=stationTrain,tr=trainStates[i];tr.mode='course';tr.phase=.025;tr.speed=.024;tr.block='LIFT';stationTrain=-1;S.checked=false;log('Train '+(i+1)+' dispatched into lift block.','good');updateUI()
}

function loop(){
 const dt=Math.min(clock.getDelta(),.05);if(running&&!paused&&!S.estop)tick(dt);animateStation(dt);updateTrains();updateCamera(dt);renderer.render(scene,camera)
}

function tick(dt){
 S.time-=dt;if(S.time<=0){S.time=0;finish();return}
 S.queue=clamp(S.queue+dt*.16,0,150);

 if(stationTrain>=0){
  if(S.exit&&S.seated>0){const u=Math.min(S.seated,dt*14);S.seated-=u;if(S.seated<.05){S.served+=24;S.seated=0}}
  if(S.entry&&!S.restraints){const b=Math.min(S.queue,24-S.seated,dt*9);S.seated+=b;S.queue-=b}
 }

 trainStates.forEach((tr,i)=>{
  if(tr.mode!=='course')return;
  tr.phase=(tr.phase+tr.speed*dt)%1;
  if(tr.phase<.28)tr.block='LIFT';else if(tr.phase<.72)tr.block='MID';else tr.block='FINAL';
  if(tr.phase>.94&&stationTrain<0&&blockClear('STATION')){
    tr.mode='station';tr.phase=.002;tr.speed=0;tr.block='STATION';stationTrain=i;S.entry=false;S.exit=false;S.restraints=false;S.checked=false;log('Train '+(i+1)+' entered station.','good')
  }
 });

 S.nextEvent-=dt;if(S.nextEvent<=0){event();S.nextEvent=rand(20,33)}
 const elapsed=Math.max(1,300-S.time);S.tph=Math.round(S.served/(elapsed/3600));S.score=Math.round(S.served*12+S.reliability*2-S.queue*.7);
 updateGuests();updateUI();
}

function animateStation(dt){
 const targetEntry=S.entry?Math.PI/2:0,targetExit=S.exit?-Math.PI/2:0;
 entryGateMeshes.forEach(g=>g.rotation.y+=(targetEntry-g.rotation.y)*.12);
 exitGateMeshes.forEach(g=>g.rotation.y+=(targetExit-g.rotation.y)*.12);
}

function event(){
 const r=Math.random();
 if(r<.48){S.checked=false;S.reliability=clamp(S.reliability-1,75,100);log('Guest restraint recheck requested.','bad')}
 else if(r<.72){S.hold=true;log('Temporary automatic ride hold.','bad');setTimeout(()=>{if(running&&!S.estop){S.hold=false;log('Ride hold cleared.','good');updateUI()}},2800)}
 else log('Queue surge at entrance.')
}

function updateTrains(){
 trainGroups.forEach((g,i)=>{
  const tr=trainStates[i],ph=tr.mode==='station'?.002:tr.phase,p=curve.getPointAt(ph),tan=curve.getTangentAt(ph).normalize();
  g.position.copy(p);g.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),tan);
 });
}

function updateGuests(){
 const visible=Math.min(guestMeshes.length,Math.round(S.queue/2.2));
 guestMeshes.forEach((g,i)=>{
  g.visible=i<visible;if(!g.visible)return;
  const row=Math.floor(i/8),col=i%8;g.position.set(-18+col*.75,0,8+row*.65);g.rotation.y=Math.sin(performance.now()*.001+i)*.12
 })
}

function updateCamera(dt){
 let pos=new THREE.Vector3(),look=new THREE.Vector3();
 if(cameraMode===0){pos.set(-14,5.4,-10.5);look.set(-2,2.6,0)} // operator booth
 else if(cameraMode===1){pos.set(-26,8,16);look.set(-4,3,0)}
 else if(cameraMode===2){pos.set(16,16,42);look.set(5,13,5)}
 else if(cameraMode===3){
  let idx=trainStates.findIndex(t=>t.mode==='course');if(idx<0)idx=0;const tr=trainStates[idx],p=curve.getPointAt(tr.phase),tan=curve.getTangentAt(tr.phase).normalize();
  pos.copy(p).add(new THREE.Vector3(0,2.7,0)).add(tan.clone().multiplyScalar(-7));look.copy(p).add(tan.clone().multiplyScalar(5))
 }else{pos.set(0,58,72);look.set(0,8,3)}
 camera.position.lerp(pos,1-Math.pow(.001,dt));camera.lookAt(look)
}

function updateUI(){
 if($('time'))$('time').textContent=fmt(S.time);
 if($('queue'))$('queue').textContent=Math.round(S.queue);
 if($('tph'))$('tph').textContent=S.tph;
 if($('score'))$('score').textContent=Math.max(0,S.score);
 $('trainLabel').textContent=stationTrain>=0?'TRAIN '+(stationTrain+1):'STATION EMPTY';$('loadLabel').textContent=Math.floor(S.seated)+' / 24';
 $('entryLabel').textContent=S.entry?'OPEN':'CLOSED';$('exitLabel').textContent=S.exit?'OPEN':'CLOSED';$('restraintLabel').textContent=S.restraints?'LOCKED':'OPEN';$('checkLabel').textContent=S.checked?'CHECKED':'NOT CHECKED';
 $('entryBtn').classList.toggle('on',S.entry);$('exitBtn').classList.toggle('on',S.exit);$('restraintBtn').classList.toggle('on',S.restraints);$('checkBtn').classList.toggle('on',S.checked);$('holdBtn').classList.toggle('warn',S.hold);
 $('dispatchA').disabled=$('dispatchB').disabled=!ready();

 const objective=stationTrain<0?'Monitor block system':S.seated<23.5?'Open entry gates':S.entry?'Close entry gates':S.exit?'Close exit gates':!S.restraints?'Lock restraints':!S.checked?'Check platform':!blockClear('LIFT')?'Wait for lift block':'Dual dispatch';
 $('objective').textContent=objective;$('objectiveText').textContent=ready()?'Press both dispatch buttons within one second.':'Complete the station sequence and maintain train spacing.';

 const lamp=$('lamp');lamp.className='lamp '+(S.estop?'fault':S.hold?'warn':'');lamp.querySelector('span').textContent=S.estop?'E-STOP ACTIVE':S.hold?'RIDE HOLD':ready()?'DISPATCH READY':'SYSTEM READY';

 const occ={STATION:'â',LIFT:'â',MID:'â',FINAL:'â'};
 trainStates.forEach((t,i)=>{if(t.mode==='station')occ.STATION='T'+(i+1);else occ[t.block]='T'+(i+1)});
 [['bStation','STATION'],['bLift','LIFT'],['bMid','MID'],['bFinal','FINAL']].forEach(([id,b])=>{const el=$(id);el.textContent=occ[b];el.parentElement.classList.toggle('occupied',occ[b]!=='â');el.parentElement.classList.toggle('clear',occ[b]==='â')})
}

function log(m,type=''){const d=document.createElement('div');d.className=type;d.textContent=fmt(S.time)+'  '+m;$('log').prepend(d);while($('log').children.length>9)$('log').lastChild.remove()}
function fmt(s){s=Math.max(0,Math.ceil(s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
function finish(){running=false;const grade=S.score>3200?'A':S.score>2300?'B':'C';$('grade').textContent='GRADE '+grade;$('result').textContent='Served '+S.served+' guests. Throughput '+S.tph+'/h. Score '+Math.max(0,S.score)+'.';$('finish').classList.remove('hidden')}
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}
})();
