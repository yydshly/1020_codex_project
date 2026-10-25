/** Renderer-tested body visibility/readability can guide every course mirror.
 * Bay references remain exclusive to the real reverse-parking yard; an old
 * aperture-only result is used only to reject an unavailable bay reference.
 * None of these display hints mark a practice observation or goal complete. */
export function courseMirrorReferenceGuide({ chapterId, stepId, side, observation } = {}) {
  if (!['left', 'right'].includes(side) || !observation) return null;
  const sceneTested = observation.occlusionChecked === true && observation.visibility === 'scene-tested';
  if (chapterId !== 'reverse-parking' && !sceneTested) return null;
  const name = side === 'right' ? '右' : '左';
  const entry = stepId === 'reverse-parking:right_turn' || stepId === 'reverse-parking:left_turn';
  const modelAction = entry ? `本段按模型校准位置示范向${stepId.endsWith('right_turn') ? '右' : '左'}转向；自己练习须先确认本车可用参照与空间，不按播放秒数打方向。` : null;
  if (observation.body?.visible === false) return {
    kind: 'body-missing', look: `先辨认${name}镜内侧的本车轮廓`,
    see: sceneTested ? '当前镜面没有清楚呈现本车参照，可能未入镜或被镜框、车体遮挡。先暂停按眼位调镜，找到内侧车身窄条。' : '当前镜位下车身参照未进入镜面。先暂停、按眼位调镜；找到本车轮廓后再比较地面线。',
    caution: '没有清楚辨认车身参照时，不凭方向盘回中判断车身已经摆直。', act: modelAction,
  };
  if (sceneTested && observation.body?.readabilityUncertain) return {
    kind: 'body-obscured', look: `${name}镜 · 车身参照受到部分遮挡`,
    see: '当前只露出部分车身，不能用一点露出的边缘推断完整车身朝向。先暂停核对遮挡，再换看另一侧确认。',
    caution: '教学放大不会穿透遮挡；看不清时，不凭镜框或一小块反光判断已经回正。', act: modelAction,
  };
  if (sceneTested && observation.body?.readable === false) return {
    kind: 'body-small', look: `${name}镜 · 先看清内侧车身窄条`,
    see: '本车边缘已出现在镜中，但当前显示较细或受镜框遮挡。先用同视野放大辨认；仍看不清再暂停调镜。',
    caution: '放大只增加显示大小，不增加镜中范围。先认车身，再比较同侧可见边线，不能拿镜框或路面纹理当车身。', act: modelAction,
  };
  if (chapterId !== 'reverse-parking') return null;
  if (sceneTested && ['surface-missing', 'surface-hidden', 'surface-invalid'].includes(observation.line?.reason)) return {
    kind: 'line-unavailable', look: `${name}镜 · 先核对场地标线`,
    see: '当前场景没有可用的真实库侧线参照，不能据此判断车身与边线关系。可切全景核对场地。',
    caution: '这不是靠反复调镜就能找出的线；不要把路面纹理、镜框或库口横线当成库侧线。', act: modelAction,
  };
  if (observation.lineVisible === false) return {
    kind: 'line-missing', look: `${name}镜 · 先认本车轮廓与侧后路面`,
    see: `${sceneTested ? '当前镜中未呈现可用的库侧线，可能尚未入镜或被车体遮住。' : observation.cornerVisible === false ? '库角和库侧线尚未进入当前镜面。' : '库侧线尚未进入当前镜面。'}先认车身内缘与路面，不用在灰色区域硬找库线。`,
    caution: '可切全景理解本模型的操作位置；这不等于实车转向点。实际练习应按固定坐姿和镜位重新校准参照。', act: modelAction,
  };
  if (observation.lineReadable === false) return {
    kind: 'line-short', look: `${name}镜 · 先辨认露出的库侧线`,
    see: '侧线只占镜面很小一段，先暂停放大、确认线的身份，再比较与同侧车身的夹角和间隙走势。',
    caution: '库口外沿和库底横线不能替代沿库深方向的侧线；两面镜的像素宽窄也不等于实际距离。', act: modelAction,
  };
  if (observation.cornerVisible === false && entry) return {
    kind: 'corner-missing', look: `${name}镜 · 先核对车身与可辨认的线`,
    see: '库角未进入当前镜面，不以它作为此刻的触发点。只比较已辨认的参照，转向示范位置可切全景核对。',
    caution: '镜内能容纳一条线，并不表示已经看清；看不清就先停住辨认。', act: modelAction,
  };
  return null;
}

/** Concise display status next to the actual magnified image. Optical-only
 * aperture checks cannot produce a positive recognition label. */
export function courseMirrorRecognitionSummary({ chapterId, observation } = {}) {
  if (!observation?.occlusionChecked || observation.visibility !== 'scene-tested') return '';
  const body = !observation.body?.visible ? '车身：暂不可辨'
    : observation.body?.readabilityUncertain ? '车身：部分遮挡'
      : observation.body?.readable ? '车身：内缘窄条可辨' : '车身：显示过细';
  if (chapterId !== 'reverse-parking') return body;
  const absentSurface = ['surface-missing', 'surface-hidden', 'surface-invalid'].includes(observation.line?.reason);
  const line = absentSurface ? '库侧线：场景参照不可用'
    : !observation.lineVisible ? '库侧线：未呈现'
      : observation.lineReadable ? '库侧线：可辨认' : '库侧线：片段过短';
  return `${body} · ${line}`;
}
