// SPDX-License-Identifier: GPL-3.0-only
// A second, real WebGL camera over the same historical atlas state and geometry.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const WORLD_SCALE = .2;
const HEIGHT_SCALE = .0018;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export async function createAtlasTerrain({host, app, onStatus = () => {}}) {
  onStatus('正在载入全域高程与历史地图…');
  const response = await fetch('./assets/atlas-elevation.json');
  if (!response.ok) throw new Error(`高程数据未能载入 (${response.status})`);
  const dem = await response.json();
  if (!Array.isArray(dem.heights) || dem.heights.length !== dem.width * dem.height) throw new Error('高程网格不完整');
  const canvas = document.createElement('canvas');
  canvas.className = 'atlas-terrain-canvas';
  canvas.setAttribute('aria-label', '三维历史地图，可拖动旋转、滚轮缩放、右键平移；点击城池或路线节点读史');
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none';
  canvas.tabIndex = 0;
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  host.append(canvas);
  const labelsHost = document.createElement('div');
  labelsHost.className = 'atlas-terrain-labels';
  labelsHost.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:2';
  host.append(labelsHost);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#d9dfd7');
  scene.fog = new THREE.Fog('#d9dfd7', 280, 640);
  const camera = new THREE.PerspectiveCamera(40, 1, .15, 1300);
  camera.position.set(0, 150, 120);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = .09;
  controls.minDistance = 12;
  controls.maxDistance = 450;
  controls.minPolarAngle = .03;
  controls.maxPolarAngle = Math.PI * .465;
  controls.rotateSpeed = .7;
  controls.zoomSpeed = .8;
  controls.panSpeed = .8;
  controls.target.set(0, 0, 0);
  scene.add(new THREE.HemisphereLight('#fff8e9', '#707866', 1.15));
  const sun = new THREE.DirectionalLight('#fff4d6', 1.75);
  sun.position.set(-130, 85, -65);
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#dbe8f0', .3);
  fill.position.set(80, 70, 90);
  scene.add(fill);

  const geometry = new THREE.PlaneGeometry(200, 140, dem.width - 1, dem.height - 1);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position');
  const sourceHeight = dem.heights.map(h => Math.max(0, h) * HEIGHT_SCALE);
  for (let i = 0; i < positions.count; i++) positions.setY(i, sourceHeight[i]);
  geometry.computeVertexNormals();

  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = 2400; textureCanvas.height = 1680;
  const context = textureCanvas.getContext('2d');
  const terrainTexture = new THREE.CanvasTexture(textureCanvas);
  terrainTexture.colorSpace = THREE.SRGBColorSpace;
  terrainTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const material = new THREE.MeshStandardMaterial({map:terrainTexture, roughness:1, metalness:0});
  const terrain = new THREE.Mesh(geometry, material);
  scene.add(terrain);
  // A subtle ground plane leaves the DEM visibly continuous, without a decorative pedestal.
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1100, 900), new THREE.MeshStandardMaterial({color:'#c7d7d1',roughness:.87}));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -.14; scene.add(sea);
  const routeGroup = new THREE.Group(); scene.add(routeGroup);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const globe = {width:1000,height:700};
  const projector = app.projector;
  const enabledLayer = id => document.getElementById(id)?.checked !== false;
  const visibleAtYear = item => (item.appear === undefined || app.year >= item.appear) && (item.vanish === undefined || app.year < item.vanish);
  let enabled = false, disposed = false, raf = 0, labels = [], stateKey = '', focusKey = '', textureKey = '', frameCount = 0;
  let terrainEnabled = true, tween = null, reportAt = 0, lastSize = [0, 0], pointerStart = null, compositionKey = '';

  function sample(screenX, screenY) {
    if (!terrainEnabled) return 0;
    const x = clamp(screenX / 1000 * (dem.width - 1), 0, dem.width - 1);
    const y = clamp(screenY / 700 * (dem.height - 1), 0, dem.height - 1);
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(dem.width - 1, x0 + 1), y1 = Math.min(dem.height - 1, y0 + 1);
    const a = sourceHeight[y0 * dem.width + x0] * (1 - (x - x0)) + sourceHeight[y0 * dem.width + x1] * (x - x0);
    const b = sourceHeight[y1 * dem.width + x0] * (1 - (x - x0)) + sourceHeight[y1 * dem.width + x1] * (x - x0);
    return a * (1 - (y - y0)) + b * (y - y0);
  }
  function point(coord, lift = .5) {
    const [x,y] = projector.toScreen(coord[0],coord[1]);
    return V((x - 500) * WORLD_SCALE, sample(x,y) + lift, (y - 350) * WORLD_SCALE);
  }
  function valid(coord) {
    if (!Array.isArray(coord) || !coord.every(Number.isFinite)) return false;
    const [x,y] = projector.toScreen(...coord);
    return x >= 0 && x <= 1000 && y >= 0 && y <= 700;
  }

  const baseCanvas = document.createElement('canvas');
  baseCanvas.width = dem.width; baseCanvas.height = dem.height;
  const baseContext = baseCanvas.getContext('2d');
  const raster = baseContext.createImageData(dem.width,dem.height);
  const mix = (a,b,t) => a.map((v,i) => Math.round(v + (b[i] - v) * t));
  dem.heights.forEach((h,i) => {
    let color;
    if (h < 0) color = mix([199,216,210],[170,196,190],clamp(-h / 6000,0,1));
    else if (h < 1800) color = mix([231,228,204],[192,199,166],h / 1800);
    else if (h < 4500) color = mix([192,199,166],[205,199,175],(h - 1800) / 2700);
    else color = mix([205,199,175],[243,237,221],clamp((h - 4500) / 2500,0,1));
    raster.data.set([...color,255],i * 4);
  });
  baseContext.putImageData(raster,0,0);

  function drawRing(ring, close = true) {
    if (!ring?.length) return;
    ring.forEach((coord,i) => {
      const p = projector.toScreen(coord[0],coord[1]);
      i ? context.lineTo(p[0],p[1]) : context.moveTo(p[0],p[1]);
    });
    if (close) context.closePath();
  }
  function drawShape(shape, fillColor, strokeColor, width, opacity = 1) {
    if (!shape?.coordinates) return;
    const polygons = shape.type === 'Polygon' ? [shape.coordinates] : shape.coordinates;
    context.beginPath(); polygons.forEach(p => p.forEach(r => drawRing(r)));
    context.globalAlpha = opacity;
    if (fillColor) {context.fillStyle = fillColor; context.fill('evenodd');}
    if (strokeColor) {context.strokeStyle = strokeColor; context.lineWidth = width; context.stroke();}
    context.globalAlpha = 1;
  }
  function refreshTexture() {
    context.setTransform(1,0,0,1,0,0);
    context.drawImage(baseCanvas,0,0,textureCanvas.width,textureCanvas.height);
    context.scale(textureCanvas.width / 1000,textureCanvas.height / 700);
    context.lineJoin = 'round'; context.lineCap = 'round';
    const snap = app.lastRenderedSnap || {};
    if (enabledLayer('chk-polities')) {
      const rank = {neighbor:0,main:1,rival:2,protectorate:3};
      [...(snap.polities || [])].sort((a,b) => (rank[a.role] || 0) - (rank[b.role] || 0)).forEach(p => {
        const color = p.tint || (p.role === 'neighbor' ? '#a4a890' : '#a86443');
        drawShape(p.shape,color,null,0,p.role === 'neighbor' ? .1 : .46);
        drawShape(p.shape,null,p.role === 'neighbor' ? '#969d89' : color,p.role === 'neighbor' ? .4 : .95,p.role === 'neighbor' ? .4 : .95);
      });
    }
    if (enabledLayer('chk-prefectures')) {
      // The upstream modern snapshot deliberately has no polity polygons. Its
      // hydrated regions are the authoritative geometry here; keep these fills
      // under the administrative-layer control instead of inventing a border.
      if (app.activeSnapKey === 's_prc' && !(snap.polities || []).length) {
        const palette=['#a6aa76','#91aba3','#b99b80','#98aab9','#b8ad83','#b1a0b0'];
        (snap.regions || []).forEach((p,i) => drawShape(p.shape,p.tint || palette[i % palette.length],null,0,.56));
      }
      for (const p of snap.prefectures || []) drawShape(p.shape,null,'#746f55',.32,.35);
      for (const p of snap.regions || []) drawShape(p.shape,null,'#766443',.48,.55);
    }
    if (enabledLayer('chk-provinces')) {
      context.setLineDash([2.2,2.6]);
      for (const p of app.provinces || []) {
        if (String(p.code).includes('_JD')) continue;
        if (p.rings) drawShape({type:'MultiPolygon',coordinates:p.rings},null,'#786f5a',.55,.5);
      }
      context.setLineDash([]);
    }
    if (terrainEnabled) {
      for (const lake of app.hydroData?.lakes || []) {
        if (!visibleAtYear(lake)) continue;
        context.beginPath(); (lake.rings || []).forEach(r => drawRing(r));
        context.fillStyle = '#8fb7b2'; context.fill('evenodd');
      }
      for (const river of app.hydroData?.rivers || []) {
        if (!visibleAtYear(river)) continue;
        context.beginPath(); (river.lines || []).forEach(r => drawRing(r,false));
        context.strokeStyle = river.rank === 1 ? '#518a91' : '#76a6a4';
        context.lineWidth = river.rank === 1 ? 1.05 : .52; context.stroke();
      }
    }
    if (enabledLayer('chk-corridors')) {
      for (const c of app.corridors || []) {
        if (c.span && (app.year < c.span[0] || app.year > c.span[1])) continue;
        context.beginPath(); (c.segments || []).forEach(r => drawRing(r,false));
        context.strokeStyle = /canal|sea/.test(c.kind) ? '#286f87' : '#95593d';
        context.lineWidth = /wall/.test(c.kind) ? 1.2 : .8;
        context.setLineDash(/wall|canal/.test(c.kind) ? [] : [3.4,2]); context.stroke();
      }
      context.setLineDash([]);
    }
    terrainTexture.needsUpdate = true;
  }

  function clearLabelsAndRoutes() {
    labelsHost.replaceChildren(); labels = [];
    routeGroup.traverse(o => {if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose();});
    routeGroup.clear();
  }
  function addLabel({coord,text,kind='city',priority=5,active=false,onClick,offset=[0,0]}) {
    if (!valid(coord)) return;
    const el = document.createElement(onClick ? 'button' : 'span');
    if (onClick) {el.type = 'button'; el.addEventListener('click',e => {e.stopPropagation();onClick();});}
    el.className = `terrain-label terrain-${kind}${active ? ' is-current' : ''}`;
    el.textContent = text;
    el.style.cssText = `position:absolute;transform:translate(-50%,-50%);white-space:nowrap;pointer-events:${onClick?'auto':'none'};border:0;font-family:"Microsoft YaHei",sans-serif;line-height:1.5;font-size:${kind==='polity'?17:kind==='route'?12:11}px;color:${active?'#fff':kind==='polity'?'#514831':'#453c2f'};background:${active?'#a43f2e':kind==='route'?'rgba(255,248,228,.96)':kind==='city'?'rgba(249,244,222,.83)':'transparent'};padding:${kind==='polity'?'0':'1px 5px'};border-radius:${kind==='route'?'12px':'3px'};font-weight:${kind==='polity'||active?'700':'500'};text-shadow:${kind==='polity'?'0 1px 4px #fff9e7,0 0 9px #f8f1da':'none'};cursor:${onClick?'pointer':'default'};box-shadow:${kind==='route'?'0 1px 5px #71634b44':'none'};max-width:190px;overflow:hidden;text-overflow:ellipsis;`;
    if (onClick) el.setAttribute('aria-label',`${kind==='route'?'前往':'查看'}${text}`);
    labelsHost.append(el);
    labels.push({el,world:point(coord,kind==='route'?1.5:.6),priority,kind,offset,width:Math.min(190,text.length*(kind==='polity'?17:12)+(kind==='polity'?0:14))});
  }
  function addRoute(stops,current,select) {
    const usable = stops.map((s,i) => ({coord:s.coord || [s.lng,s.lat],s,i})).filter(s => valid(s.coord));
    const peerMap = new Map();
    usable.forEach(({coord,s,i}) => {
      const key = coord.map(n => n.toFixed(2)).join(',');
      if (!peerMap.has(key)) peerMap.set(key,[]); peerMap.get(key).push(i);
    });
    usable.forEach(({coord,s,i},j) => {
      if (j > 0) {
        const a = projector.toScreen(...usable[j-1].coord), b = projector.toScreen(...coord);
        const distance = Math.hypot(b[0]-a[0],b[1]-a[1]);
        const pts = Array.from({length:49},(_,k) => {
          const t = k / 48, bend = Math.sin(t*Math.PI) * Math.min(22,distance*.12);
          const x = a[0]+(b[0]-a[0])*t - (b[1]-a[1])/Math.max(distance,1)*bend;
          const y = a[1]+(b[1]-a[1])*t + (b[0]-a[0])/Math.max(distance,1)*bend;
          return V((x-500)*.2,sample(x,y)+.7+Math.sin(Math.PI*t)*Math.min(3,distance*.014),(y-350)*.2);
        });
        const curve = new THREE.CatmullRomCurve3(pts);
        const selected = current < 0 || i === current;
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve,48,selected?.19:.10,5,false),new THREE.MeshBasicMaterial({color:selected?'#a83928':'#8e5b42',transparent:true,opacity:selected?.95:.42}));
        routeGroup.add(tube);
      }
      const active = i === current;
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(active?.65:.38,12,8),new THREE.MeshBasicMaterial({color:active?'#bb3f2c':'#f9efd8'}));
      sphere.position.copy(point(coord,1)); routeGroup.add(sphere);
      const peers = peerMap.get(coord.map(n=>n.toFixed(2)).join(','));
      const peer = peers.indexOf(i);
      const offset = peers.length > 1 ? [0,-11+(peer-(peers.length-1)*.5)*26] : [0,-11];
      const name = s.siteZh || s.ancientZh || s.query || s.name || s.ancient || '';
      addLabel({coord,text:`${i+1}${active||current<0?' · '+name:''}`,kind:'route',priority:active?0:1,active,onClick:()=>select(i),offset});
    });
    canvas.dataset.points = String(usable.length);
  }

  function rebuildAnnotations() {
    clearLabelsAndRoutes();
    const dynasty = app.dynasties[app.dynastyIdx];
    const snap = app.lastRenderedSnap || {};
    canvas.dataset.points = '0';
    if (app.activePerson) addRoute(app.activePerson.events,app.activePersonEventIdx,i=>app.selectPersonEvent(i,true));
    else if (app.activeCustomRoute) addRoute(app.activeCustomRoute,app.customRouteStopIdx,i=>app.selectCustomRouteStop(i,true));
    if (app.activeTrace && valid(app.activeTrace)) {
      const pin = new THREE.Mesh(new THREE.ConeGeometry(.65,3,12),new THREE.MeshBasicMaterial({color:'#b34730'}));
      pin.rotation.z = Math.PI; pin.position.copy(point(app.activeTrace,2.1)); routeGroup.add(pin);
      if (!app.activeCustomRoute) addLabel({coord:app.activeTrace,text:app.activeTraceLabel || '当前地点',kind:'route',active:true,priority:0,offset:[0,-18]});
    }
    if (enabledLayer('chk-settlements') && !app.challenge) {
      for (const city of (dynasty?.settlements || []).filter(visibleAtYear)) {
        const capital = app._isSettlementCapital?.(city,app.year) || false;
        addLabel({coord:city.coord,text:`${capital?'◆ ':''}${city.ancient}`,priority:capital?3:city.tier===2?9:6,onClick:()=>app.openGenealogyAt(city.coord[0],city.coord[1],city.ancient)});
      }
    }
    if (enabledLayer('chk-polities')) for (const p of snap.polities || []) {
      if (p.anchor && p.role !== 'neighbor') addLabel({coord:p.anchor,text:p.title,kind:'polity',priority:2});
    }
    const modernRegions=app.activeSnapKey==='s_prc'&&!(snap.polities||[]).length&&enabledLayer('chk-prefectures');
    if (modernRegions) for (const p of snap.regions || []) {
      if (p.anchor) addLabel({coord:p.anchor,text:p.title,kind:'polity',priority:4});
    }
    if (enabledLayer('chk-prov-names')&&!modernRegions) for (const p of app.provinces || []) {
      if (p.hub || p.center || p.anchor) addLabel({coord:p.hub||p.center||p.anchor,text:p.name||p.title||'',kind:'region',priority:8});
    }
    if (enabledLayer('chk-milestones') && !app.activePerson && !app.challenge) {
      for (const m of dynasty?.milestones || []) {
        if (m.coord && m.year === app.year) addLabel({coord:m.coord,text:`◇ ${m.headline || m.title || m.text || m.event || '当年史事'}`,kind:'route',priority:1,onClick:()=>app.openGenealogyAt(...m.coord)});
      }
    }
    labels.sort((a,b)=>a.priority-b.priority);
  }

  function travel(target,distance,animate=true) {
    const offset = V(distance*.08,distance*.84,distance*.61);
    const to = target.clone().add(offset);
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      camera.position.copy(to);controls.target.copy(target);tween=null;controls.update();return;
    }
    tween = {from:camera.position.clone(),targetFrom:controls.target.clone(),to,target,start:performance.now()};
  }
  function focusState(animate=true) {
    let coord, distance = 205;
    if (app.activePerson && app.activePersonEventIdx >= 0) {coord=app.activePerson.events[app.activePersonEventIdx]?.coord;distance=68;}
    else if (app.activeTrace) {coord=app.activeTrace;distance=72;}
    else {
      const route = app.activePerson?.events || app.activeCustomRoute;
      if (route?.length) {
        const pts = route.map(s=>s.coord || [s.lng,s.lat]).filter(valid).map(c=>point(c));
        if (pts.length) {
          const box=new THREE.Box3().setFromPoints(pts), size=box.getSize(V(0,0,0));
          const d = Math.max(80,size.x*1.75,size.z*2.2);
          travel(box.getCenter(V(0,0,0)),d * viewportFactor(),animate);return;
        }
      }
      const cam = app._cameraTarget || app.camera;
      if (cam && Number.isFinite(cam.x) && Number.isFinite(cam.y)) {
        const sx=cam.x+cam.w*.5, sy=cam.y+cam.h*.5;
        coord=projector.toGeo(sx,sy);
        distance=clamp(cam.w*.28,65,260);
      }
    }
    const target = coord ? point(coord,0) : V(12,1,1);
    travel(target,distance*viewportFactor(),animate);
  }
  function viewportFactor() {return clamp(1 / Math.max(.65,camera.aspect),1,1.6);}

  function focusViewport(animate=true) {
    const view=app._cameraTarget || app.camera;
    if(!view||![view.x,view.y,view.w,view.h].every(Number.isFinite))return;
    updateComposition();
    const coord=projector.toGeo(view.x+view.w*.5,view.y+view.h*.5);
    travel(point(coord,0),clamp(view.w*.28,65,260)*viewportFactor(),animate);
  }

  // Off-axis projection keeps the selected coordinate in the part of the map that
  // is actually visible. The source UI uses a right card on desktop and a bottom
  // sheet below 901 px. Moving the frustum preserves orbit around the true place.
  function updateComposition() {
    const w=host.clientWidth,h=host.clientHeight;
    if(!w||!h)return;
    const card=document.getElementById('genealogy-card');
    let ox=0,oy=0;
    if(card&&!card.classList.contains('is-hidden')&&card.getClientRects().length) {
      const frame=host.getBoundingClientRect(),r=card.getBoundingClientRect();
      const overlaps=r.bottom>frame.top&&r.top<frame.bottom&&r.right>frame.left&&r.left<frame.right;
      if(overlaps) {
        if(window.innerWidth<=900) {
          const bottom=clamp(r.top-frame.top-16,72,h);
          const desiredY=(24+bottom)*.5;
          oy=clamp(h*.5-desiredY,0,h*.42);
        } else {
          const right=clamp(r.left-frame.left-18,120,w);
          const desiredX=(16+right)*.5;
          ox=clamp(w*.5-desiredX,0,w*.42);
        }
      }
    }
    const key=[w,h,Math.round(ox),Math.round(oy)].join(',');
    if(key===compositionKey)return;
    compositionKey=key;
    if(ox||oy) camera.setViewOffset(w,h,ox,oy,w,h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    canvas.dataset.viewOffset=`${Math.round(ox)},${Math.round(oy)}`;
  }

  function sync() {
    if (disposed) return;
    updateComposition();
    const layers=['chk-polities','chk-prefectures','chk-provinces','chk-prov-names','chk-terrain','chk-settlements','chk-corridors','chk-milestones'].map(id=>enabledLayer(id)?1:0).join('');
    const newTerrain=enabledLayer('chk-terrain');
    if (newTerrain!==terrainEnabled) {
      terrainEnabled=newTerrain;
      for(let i=0;i<positions.count;i++) positions.setY(i,newTerrain?sourceHeight[i]:0);
      positions.needsUpdate=true; geometry.computeVertexNormals();
    }
    const nextTexture=`${app.year}|${app.activeSnapKey}|${layers}|${app.lastRenderedSnap?.caption||''}`;
    if(nextTexture!==textureKey) {refreshTexture();textureKey=nextTexture;}
    const routeKey=app.activeCustomRoute?.map(s=>`${s.lng},${s.lat},${s.year}`).join(';')||'';
    const personKey=app.activePerson?.profile?.key||'';
    const traceKey=app.activeTrace?.join(',')||'';
    const nextFocus=`${personKey}:${app.activePersonEventIdx}|${routeKey}:${app.customRouteStopIdx}|${traceKey}`;
    const nextState=`${nextTexture}|${nextFocus}|${app.activeTraceLabel||''}`;
    if(nextState!==stateKey) {rebuildAnnotations();stateKey=nextState;}
    if(nextFocus!==focusKey) {focusKey=nextFocus;focusState(frameCount>0);}
    canvas.dataset.year=String(app.year);
    canvas.dataset.snapshot=String(app.activeSnapKey||'');
    canvas.dataset.layers=layers;
    canvas.dataset.ready='true';
    canvas.dataset.engine='three-r180-webgl2';
    canvas.dataset.person=personKey;
    canvas.dataset.selected=String(app.activePerson?app.activePersonEventIdx:app.customRouteStopIdx);
  }

  function layoutLabels() {
    const width=host.clientWidth,height=host.clientHeight;
    const boxes=[];
    let shown=0;
    for(const item of labels) {
      const p=item.world.clone().project(camera);
      const x=(p.x*.5+.5)*width+item.offset[0];
      let y=(-p.y*.5+.5)*height+item.offset[1];
      let show=p.z>=-1&&p.z<=1&&x>15&&x<width-15&&y>12&&y<height-12;
      const w=item.width,h=item.kind==='polity'?25:21;
      const rect={x:x-w*.5-3,y:y-h*.5-2,w:w+6,h:h+4};
      // Nearby historical references may use slightly different coordinates for
      // the same city. Keep every route label readable, including those pairs.
      if(show && item.kind==='route') {
        const baseY=y;
        const shift=[0,26,-26,52,-52,78,-78,104,-104].find(delta=>{
          const top=baseY+delta-h*.5-2;
          return top>4 && top+h+4<height && !boxes.some(b=>rect.x<b.x+b.w&&rect.x+rect.w>b.x&&top<b.y+b.h&&top+rect.h>b.y);
        });
        if(shift===undefined) show=false;
        else {y=baseY+shift;rect.y=y-h*.5-2;}
      }
      if(show&&item.priority>1) {
        show=!boxes.some(b=>rect.x<b.x+b.w&&rect.x+rect.w>b.x&&rect.y<b.y+b.h&&rect.y+rect.h>b.y);
        if(shown>70) show=false;
      }
      item.el.style.display=show?'':'none';
      if(show) {item.el.style.left=`${x}px`;item.el.style.top=`${y}px`;boxes.push(rect);shown++;}
    }
  }

  function resize() {
    const w=host.clientWidth,h=host.clientHeight;
    if(!w||!h)return;
    updateComposition();
    if(lastSize[0]===w&&lastSize[1]===h)return;
    lastSize=[w,h];renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
    if(enabled)focusState(false);
  }
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);
  const genealogyCard=document.getElementById('genealogy-card');
  if(genealogyCard) resizeObserver.observe(genealogyCard);
  const cardObserver=new MutationObserver(updateComposition);
  if(genealogyCard) cardObserver.observe(genealogyCard,{attributes:true,attributeFilter:['class','style']});
  controls.addEventListener('start',()=>{tween=null;});
  canvas.addEventListener('pointerdown',e=>{pointerStart=[e.clientX,e.clientY];});
  canvas.addEventListener('dblclick',e=>{
    if(!pointerStart||Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>8)return;
    const rect=canvas.getBoundingClientRect();
    pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    const hit=raycaster.intersectObject(terrain)[0];
    if(hit){const geo=projector.toGeo(hit.point.x/.2+500,hit.point.z/.2+350);app.openGenealogyAt(...geo);}
  });
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();canvas.dataset.ready='false';setEnabled(false);onStatus('三维图形上下文已中断，请切回平面地图或刷新重试。');});
  function tick(now) {
    if(!enabled||disposed)return;
    if(tween){const t=clamp((now-tween.start)/800,0,1),k=1-(1-t)**3;camera.position.lerpVectors(tween.from,tween.to,k);controls.target.lerpVectors(tween.targetFrom,tween.target,k);if(t>=1)tween=null;}
    controls.update();renderer.render(scene,camera);layoutLabels();frameCount++;
    if(now-reportAt>650){canvas.dataset.frames=String(frameCount);canvas.dataset.triangles=String(renderer.info.render.triangles);canvas.dataset.camera=camera.position.toArray().map(n=>n.toFixed(2)).join(',');reportAt=now;}
    raf=requestAnimationFrame(tick);
  }
  function setEnabled(value) {
    if(disposed)return;
    enabled=!!value;host.hidden=!enabled;
    if(enabled){resize();sync();focusState(false);cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);onStatus('3D 地形已就绪 · 拖动旋转 / 滚轮缩放 / 右键平移');}
    else{cancelAnimationFrame(raf);tween=null;}
  }
  function reset(){focusState(true);}
  function dispose(){disposed=true;enabled=false;cancelAnimationFrame(raf);resizeObserver.disconnect();cardObserver.disconnect();controls.dispose();clearLabelsAndRoutes();scene.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});terrainTexture.dispose();renderer.dispose();canvas.remove();labelsHost.remove();}
  host.hidden=true;resize();sync();
  return {setEnabled,sync,reset,focusViewport,dispose};
}
