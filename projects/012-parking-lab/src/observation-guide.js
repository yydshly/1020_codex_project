/** One observation vocabulary for every mode. Visibility is supplied by the
 * renderer, including aperture and scene occlusion; nothing is moved into view. */
export function observationGuide(side, observation = {}) {
  const name = side === 'left' ? '左' : '右';
  const bodyVisible = observation.body?.visible === true;
  const lineVisible = observation.lineVisible === true;
  const lineReadable = lineVisible && observation.lineReadable !== false;
  if (!bodyVisible) return {
    side, bodyVisible, lineVisible, lineReadable, needsAdjustment: true,
    look: `先调${name}镜，找到本车车身参照`,
    text: '当前看不清本车车身参照。先固定座椅，按当前眼位推荐镜面，再检查内侧车身和侧后地面。',
  };
  if (!lineVisible) return {
    side, bodyVisible, lineVisible, lineReadable, needsAdjustment: false,
    look: `先认${name}镜里的车身和侧后路面`,
    text: `镜内侧窄边是本车，灰色区域是路面。库侧线尚未进入当前镜域。${observation.entranceLine?.visible ? '横着伸向库外的黄线是库口外沿。' : ''}${observation.backLine?.visible ? '目前可见的库底横线不能替代库侧线。' : ''}不用找后轮或库角；低速观察，等库侧线进入后再比较。`,
  };
  if (!lineReadable) return {
    side, bodyVisible, lineVisible, lineReadable, needsAdjustment: false,
    look: `先辨认${name}镜里露出的一小段库侧线`,
    text: `当前只露出很短的库侧线，还不足以比较走势。${observation.entranceLine?.visible ? '横着伸向库外的是库口外沿，不能替代库侧线。' : ''}${observation.backLine?.visible ? '库底线也已出现，不能替代库侧线。' : ''}先等更多侧线进入镜面，再比较走势。`,
  };
  return {
    side, bodyVisible, lineVisible, lineReadable, needsAdjustment: false,
    look: `看${name}镜车身与库侧线的间隙变化`,
    text: `内侧窄边是本车，沿库深处延伸的是库侧线，镜中可能倾斜或弯曲。${observation.entranceLine?.visible ? '向库外横着延伸的是库口外沿，不是库底。' : ''}${observation.backLine?.visible ? '库尾横向封口的是库底线，不能用它判断入库方向。' : ''}看同侧间隙变化再核对另一侧，不把两镜画面宽窄直接当成实际距离。`,
  };
}

export function recognitionChallenge(step, observation = {}) {
  if (step === 'mirror') return {
    key: 'body', available: observation.body?.visible === true,
    question: '认一认：镜内侧贴近边缘的窄轮廓是什么？',
    options: [
      { value: 'body', label: '本车车身' },
      { value: 'line', label: '车库边线' },
      { value: 'wheel', label: '完整后轮' },
    ],
    correct: 'body', success: '认对了。把这条车身轮廓作为参照，再等库线进入镜面。',
    retry: '再看内侧轮廓与旁边路面的区别。它随本车一起移动；黄色库线属于地面。',
  };
  if (step === 'compare') return {
    key: 'relation', available: observation.body?.visible === true && observation.lineVisible === true && observation.lineReadable !== false,
    question: '判断入库走势，应观察什么？',
    options: [
      { value: 'frame', label: '镜框与地平线' },
      { value: 'relation', label: '同侧车身与库侧线的间隙变化，再核对另一侧' },
      { value: 'wheel', label: '只看方向盘是否回中' },
    ],
    correct: 'relation', success: '判断依据正确。看同一面镜的变化，再确认另一侧；前轮回中不等于车身已直。',
    retry: '镜框、方向盘回中和库底横线都不能代表入库走势。请看本车侧缘与同侧库侧线，不直接比较两镜里的像素间距。',
  };
  return null;
}
