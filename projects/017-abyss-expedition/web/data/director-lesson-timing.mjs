// SPDX-License-Identifier: GPL-3.0-only
// Locally generated from unchanged director MP3s and exact public phrases.
const freezeDeep=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freezeDeep);Object.freeze(value);}return value;};
export const directorLessonTimingInfo=freezeDeep({
  "schema": "abyss-director-lesson-timing/v1",
  "method": "silence-assisted-text-estimate/v1",
  "limitations": "Measured acoustic pauses are matched heuristically to punctuation; text intervals are interpolated. This is phrase-level assistance, not word-level forced alignment."
});
export const directorLessonTiming=freezeDeep({
  "vents-equipment": {
    "method": "silence-assisted-text-estimate/v1",
    "text": "人留在母船上，黄色遥控无人潜器不载人。灯光和相机让操作员看清海床，声呐帮助辨认方位和障碍；推进器负责移动、转向和悬停。浮力材料托住机体，耐压舱保护电子设备。脐带输送电力和指令，并把画面传回船上控制台。机械臂操作工具，随身的小型采水瓶封住水样；海底的采水站是提前布放的设备。船员用绞车放下和收回潜器。看清目标、稳住位置、操作取样，需要这套设备共同配合；画面和读数仍为教学模拟。",
    "duration": 49.536,
    "audioSha256": "336741d6aa1057f18b1471a7a6755cbead8f9e751408068c24579cce5c87c1ce",
    "textSha256": "9942f66dcd31b1495ccbe5c558ae1ed914b4a5b5b632ce7be169ff406f0861bb",
    "anchors": [
      {
        "offset": 0,
        "seconds": 0,
        "source": "clip-start"
      },
      {
        "offset": 7,
        "seconds": 2.10312,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 1.46025,
        "pauseEnd": 2.10312,
        "predictedSeconds": 1.809249,
        "predictionCorrectionSeconds": 0.293871
      },
      {
        "offset": 19,
        "seconds": 5.16572,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 4.481,
        "pauseEnd": 5.16572,
        "predictedSeconds": 5.128286,
        "predictionCorrectionSeconds": 0.037434
      },
      {
        "offset": 33,
        "seconds": 8.98631,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 8.39775,
        "pauseEnd": 8.98631,
        "predictedSeconds": 8.684397,
        "predictionCorrectionSeconds": 0.301913
      },
      {
        "offset": 45,
        "seconds": 11.8442,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 11.2142,
        "pauseEnd": 11.8442,
        "predictedSeconds": 11.853703,
        "predictionCorrectionSeconds": -0.009503
      },
      {
        "offset": 53,
        "seconds": 13.9702,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 13.7146,
        "pauseEnd": 13.9702,
        "predictedSeconds": 13.750295,
        "predictionCorrectionSeconds": 0.219905
      },
      {
        "offset": 59,
        "seconds": 15.9919,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 15.4029,
        "pauseEnd": 15.9919,
        "predictedSeconds": 15.572022,
        "predictionCorrectionSeconds": 0.419878
      },
      {
        "offset": 68,
        "seconds": 18.4765,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 17.6762,
        "pauseEnd": 18.4765,
        "predictedSeconds": 17.880375,
        "predictionCorrectionSeconds": 0.596125
      },
      {
        "offset": 78,
        "seconds": 20.7089,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 20.2074,
        "pauseEnd": 20.7089,
        "predictedSeconds": 20.700308,
        "predictionCorrectionSeconds": 0.008592
      },
      {
        "offset": 88,
        "seconds": 23.2852,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 22.5954,
        "pauseEnd": 23.2852,
        "predictedSeconds": 23.258213,
        "predictionCorrectionSeconds": 0.026987
      },
      {
        "offset": 100,
        "seconds": 26.4415,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 25.5618,
        "pauseEnd": 26.4415,
        "predictedSeconds": 26.577249,
        "predictionCorrectionSeconds": -0.135749
      },
      {
        "offset": 108,
        "seconds": 28.4225,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 27.8853,
        "pauseEnd": 28.4225,
        "predictedSeconds": 28.63605,
        "predictionCorrectionSeconds": -0.21355
      },
      {
        "offset": 121,
        "seconds": 31.8381,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 31.2159,
        "pauseEnd": 31.8381,
        "predictedSeconds": 32.054908,
        "predictionCorrectionSeconds": -0.216808
      },
      {
        "offset": 136,
        "seconds": 35.761,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 34.9015,
        "pauseEnd": 35.761,
        "predictedSeconds": 36.122599,
        "predictionCorrectionSeconds": -0.361599
      },
      {
        "offset": 149,
        "seconds": 39.3162,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 38.883,
        "pauseEnd": 39.3162,
        "predictedSeconds": 39.691188,
        "predictionCorrectionSeconds": -0.374988
      },
      {
        "offset": 154,
        "seconds": 40.657,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 40.2354,
        "pauseEnd": 40.657,
        "predictedSeconds": 40.839125,
        "predictionCorrectionSeconds": -0.182125
      },
      {
        "offset": 159,
        "seconds": 41.9498,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 41.4145,
        "pauseEnd": 41.9498,
        "predictedSeconds": 41.987063,
        "predictionCorrectionSeconds": -0.037263
      },
      {
        "offset": 164,
        "seconds": 43.685,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 42.8747,
        "pauseEnd": 43.685,
        "predictedSeconds": 43.297209,
        "predictionCorrectionSeconds": 0.387791
      },
      {
        "offset": 175,
        "seconds": 46.6017,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 45.6579,
        "pauseEnd": 46.6017,
        "predictedSeconds": 46.216963,
        "predictionCorrectionSeconds": 0.384737
      },
      {
        "offset": 187,
        "seconds": 49.536,
        "source": "clip-end"
      }
    ],
    "detectedSilences": [
      {
        "start": 0,
        "end": 0.175094,
        "duration": 0.175094
      },
      {
        "start": 1.46025,
        "end": 2.10312,
        "duration": 0.64287
      },
      {
        "start": 4.481,
        "end": 5.16572,
        "duration": 0.68472
      },
      {
        "start": 6.31272,
        "end": 6.69166,
        "duration": 0.37894
      },
      {
        "start": 8.39775,
        "end": 8.98631,
        "duration": 0.58856
      },
      {
        "start": 11.2142,
        "end": 11.8442,
        "duration": 0.63
      },
      {
        "start": 12.5579,
        "end": 12.903,
        "duration": 0.3451
      },
      {
        "start": 13.7146,
        "end": 13.9702,
        "duration": 0.2556
      },
      {
        "start": 14.5053,
        "end": 14.7064,
        "duration": 0.2011
      },
      {
        "start": 15.4029,
        "end": 15.9919,
        "duration": 0.589
      },
      {
        "start": 17.6762,
        "end": 18.4765,
        "duration": 0.8003
      },
      {
        "start": 20.2074,
        "end": 20.7089,
        "duration": 0.5015
      },
      {
        "start": 22.5954,
        "end": 23.2852,
        "duration": 0.6898
      },
      {
        "start": 25.5618,
        "end": 26.4415,
        "duration": 0.8797
      },
      {
        "start": 27.8853,
        "end": 28.4225,
        "duration": 0.5372
      },
      {
        "start": 30.1505,
        "end": 30.397,
        "duration": 0.2465
      },
      {
        "start": 31.2159,
        "end": 31.8381,
        "duration": 0.6222
      },
      {
        "start": 33.0628,
        "end": 33.4032,
        "duration": 0.3404
      },
      {
        "start": 34.9015,
        "end": 35.761,
        "duration": 0.8595
      },
      {
        "start": 36.9715,
        "end": 37.1564,
        "duration": 0.1849
      },
      {
        "start": 37.679,
        "end": 37.9021,
        "duration": 0.2231
      },
      {
        "start": 38.883,
        "end": 39.3162,
        "duration": 0.4332
      },
      {
        "start": 40.2354,
        "end": 40.657,
        "duration": 0.4216
      },
      {
        "start": 41.4145,
        "end": 41.9498,
        "duration": 0.5353
      },
      {
        "start": 42.8747,
        "end": 43.685,
        "duration": 0.8103
      },
      {
        "start": 45.6579,
        "end": 46.6017,
        "duration": 0.9438
      },
      {
        "start": 47.5968,
        "end": 48.0577,
        "duration": 0.4609
      },
      {
        "start": 49.2184,
        "end": 49.5195,
        "duration": 0.3011
      }
    ],
    "quality": {
      "punctuationBoundaries": 18,
      "detectedPauses": 26,
      "matchedPauses": 18,
      "meanPredictionCorrectionSeconds": 0.233823,
      "maxPredictionCorrectionSeconds": 0.596125,
      "maxUnanchoredSeconds": 3.9229
    },
    "limitations": "Measured acoustic pauses are matched heuristically to punctuation; text intervals are interpolated. This is phrase-level assistance, not word-level forced alignment."
  },
  "vents-fluid": {
    "method": "silence-assisted-text-estimate/v1",
    "text": "热液就是受地下热源加热、又与岩石发生反应的水。看这个剖面：冷海水沿裂缝下渗，在地下受热，带上与岩石反应产生的物质，再沿通道上涌。这是一套水的循环，我们接下来要找的喷口，就是它重新进入海洋的出口。",
    "duration": 24.012,
    "audioSha256": "27501e7222d5b5a35aea6ea3a3f78b4f672907e20a125e445d90a94e701edcca",
    "textSha256": "a431c364363904bec1a51a897da2ebef0e23f2e703e26b07ff7b4b7c7a8fecca",
    "anchors": [
      {
        "offset": 0,
        "seconds": 0,
        "source": "clip-start"
      },
      {
        "offset": 23,
        "seconds": 6.36419,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 5.75056,
        "pauseEnd": 6.36419,
        "predictedSeconds": 5.626341,
        "predictionCorrectionSeconds": 0.737849
      },
      {
        "offset": 38,
        "seconds": 9.40728,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 9.16091,
        "pauseEnd": 9.40728,
        "predictedSeconds": 9.275224,
        "predictionCorrectionSeconds": 0.132056
      },
      {
        "offset": 44,
        "seconds": 11.0412,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 10.4522,
        "pauseEnd": 11.0412,
        "predictedSeconds": 10.746547,
        "predictionCorrectionSeconds": 0.294653
      },
      {
        "offset": 57,
        "seconds": 12.9169,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 11.9826,
        "pauseEnd": 12.9169,
        "predictedSeconds": 13.865753,
        "predictionCorrectionSeconds": -0.948853
      },
      {
        "offset": 64,
        "seconds": 15.7764,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 15.2142,
        "pauseEnd": 15.7764,
        "predictedSeconds": 15.819671,
        "predictionCorrectionSeconds": -0.043271
      },
      {
        "offset": 73,
        "seconds": 17.4243,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 16.9408,
        "pauseEnd": 17.4243,
        "predictedSeconds": 17.997229,
        "predictionCorrectionSeconds": -0.572929
      },
      {
        "offset": 84,
        "seconds": 21.6078,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 21.1337,
        "pauseEnd": 21.6078,
        "predictedSeconds": 20.645612,
        "predictionCorrectionSeconds": 0.962188
      },
      {
        "offset": 97,
        "seconds": 24.012,
        "source": "clip-end"
      }
    ],
    "detectedSilences": [
      {
        "start": 0,
        "end": 0.152938,
        "duration": 0.152938
      },
      {
        "start": 0.76225,
        "end": 1.22844,
        "duration": 0.46619
      },
      {
        "start": 3.02897,
        "end": 3.79356,
        "duration": 0.76459
      },
      {
        "start": 5.75056,
        "end": 6.36419,
        "duration": 0.61363
      },
      {
        "start": 7.30525,
        "end": 8.34022,
        "duration": 1.03497
      },
      {
        "start": 9.16091,
        "end": 9.40728,
        "duration": 0.24637
      },
      {
        "start": 10.4522,
        "end": 11.0412,
        "duration": 0.589
      },
      {
        "start": 11.9826,
        "end": 12.9169,
        "duration": 0.9343
      },
      {
        "start": 15.2142,
        "end": 15.7764,
        "duration": 0.5622
      },
      {
        "start": 16.9408,
        "end": 17.4243,
        "duration": 0.4835
      },
      {
        "start": 18.7964,
        "end": 19.5268,
        "duration": 0.7304
      },
      {
        "start": 21.1337,
        "end": 21.6078,
        "duration": 0.4741
      },
      {
        "start": 23.6667,
        "end": 23.9955,
        "duration": 0.3288
      }
    ],
    "quality": {
      "punctuationBoundaries": 9,
      "detectedPauses": 11,
      "matchedPauses": 7,
      "meanPredictionCorrectionSeconds": 0.5274,
      "maxPredictionCorrectionSeconds": 0.962188,
      "maxUnanchoredSeconds": 6.36419
    },
    "limitations": "Measured acoustic pauses are matched heuristically to punctuation; text intervals are interpolated. This is phrase-level assistance, not word-level forced alignment."
  },
  "vents-discover": {
    "method": "silence-assisted-text-estimate/v1",
    "text": "出口叫热液喷口。热水遇到冷海水后，一些矿物从水中析出，变成细小固体颗粒，悬浮时像黑烟，并不是燃烧或岩浆。另一些矿物沉在出口周围，逐层垒成中空烟囱。所以眼前的岩柱、流出的热水和黑色颗粒，是三个不同的东西。",
    "duration": 26.46,
    "audioSha256": "ebf6cd66b884e7390650061fabb836614b03ae8b8442f08e8b812614a8569929",
    "textSha256": "36535be14e212106a427c3499a5ac36e1d5be46b73fe1ccdd65d4b3b81368373",
    "anchors": [
      {
        "offset": 0,
        "seconds": 0,
        "source": "clip-start"
      },
      {
        "offset": 8,
        "seconds": 2.99178,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 2.08878,
        "pauseEnd": 2.99178,
        "predictedSeconds": 2.293364,
        "predictionCorrectionSeconds": 0.698416
      },
      {
        "offset": 17,
        "seconds": 5.31503,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 4.65403,
        "pauseEnd": 5.31503,
        "predictedSeconds": 4.574399,
        "predictionCorrectionSeconds": 0.740631
      },
      {
        "offset": 27,
        "seconds": 6.35103,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 6.10953,
        "pauseEnd": 6.35103,
        "predictedSeconds": 7.102032,
        "predictionCorrectionSeconds": -0.751002
      },
      {
        "offset": 36,
        "seconds": 10.2082,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 9.60869,
        "pauseEnd": 10.2082,
        "predictedSeconds": 9.383066,
        "predictionCorrectionSeconds": 0.825134
      },
      {
        "offset": 43,
        "seconds": 11.2225,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 10.9779,
        "pauseEnd": 11.2225,
        "predictedSeconds": 11.170904,
        "predictionCorrectionSeconds": 0.051596
      },
      {
        "offset": 52,
        "seconds": 12.62,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 11.9486,
        "pauseEnd": 12.62,
        "predictedSeconds": 13.710867,
        "predictionCorrectionSeconds": -1.090867
      },
      {
        "offset": 64,
        "seconds": 16.061,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 15.8225,
        "pauseEnd": 16.061,
        "predictedSeconds": 16.731696,
        "predictionCorrectionSeconds": -0.670696
      },
      {
        "offset": 73,
        "seconds": 20.0446,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 19.5993,
        "pauseEnd": 20.0446,
        "predictedSeconds": 19.271659,
        "predictionCorrectionSeconds": 0.772941
      },
      {
        "offset": 81,
        "seconds": 21.9206,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 21.3907,
        "pauseEnd": 21.9206,
        "predictedSeconds": 21.145806,
        "predictionCorrectionSeconds": 0.774794
      },
      {
        "offset": 92,
        "seconds": 23.1956,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 22.8484,
        "pauseEnd": 23.1956,
        "predictedSeconds": 23.920037,
        "predictionCorrectionSeconds": -0.724437
      },
      {
        "offset": 101,
        "seconds": 26.46,
        "source": "clip-end"
      }
    ],
    "detectedSilences": [
      {
        "start": 0,
        "end": 0.180188,
        "duration": 0.180188
      },
      {
        "start": 0.742594,
        "end": 1.04456,
        "duration": 0.301966
      },
      {
        "start": 2.08878,
        "end": 2.99178,
        "duration": 0.903
      },
      {
        "start": 4.65403,
        "end": 5.31503,
        "duration": 0.661
      },
      {
        "start": 6.10953,
        "end": 6.35103,
        "duration": 0.2415
      },
      {
        "start": 7.46303,
        "end": 8.03966,
        "duration": 0.57663
      },
      {
        "start": 9.60869,
        "end": 10.2082,
        "duration": 0.59951
      },
      {
        "start": 10.9779,
        "end": 11.2225,
        "duration": 0.2446
      },
      {
        "start": 11.9486,
        "end": 12.62,
        "duration": 0.6714
      },
      {
        "start": 13.6171,
        "end": 13.7636,
        "duration": 0.1465
      },
      {
        "start": 14.4523,
        "end": 14.909,
        "duration": 0.4567
      },
      {
        "start": 15.8225,
        "end": 16.061,
        "duration": 0.2385
      },
      {
        "start": 17.1716,
        "end": 17.8446,
        "duration": 0.673
      },
      {
        "start": 19.5993,
        "end": 20.0446,
        "duration": 0.4453
      },
      {
        "start": 21.3907,
        "end": 21.9206,
        "duration": 0.5299
      },
      {
        "start": 22.8484,
        "end": 23.1956,
        "duration": 0.3472
      },
      {
        "start": 24.172,
        "end": 24.7292,
        "duration": 0.5572
      },
      {
        "start": 26.1171,
        "end": 26.4435,
        "duration": 0.3264
      }
    ],
    "quality": {
      "punctuationBoundaries": 10,
      "detectedPauses": 15,
      "matchedPauses": 10,
      "meanPredictionCorrectionSeconds": 0.710051,
      "maxPredictionCorrectionSeconds": 1.090867,
      "maxUnanchoredSeconds": 3.9836
    },
    "limitations": "Measured acoustic pauses are matched heuristically to punctuation; text intervals are interpolated. This is phrase-level assistance, not word-level forced alignment."
  },
  "vents-life": {
    "method": "silence-assisted-text-estimate/v1",
    "text": "热液中的某些物质与海水成分反应，可以释放化学能。一些微生物利用这种能量制造有机食物。这里以有共生细菌的热液管虫为例：细菌住在管虫体内并供给养分。管虫不是直接吃矿物；也不是所有深海生命都依靠热液。",
    "duration": 24.336,
    "audioSha256": "8b796700409390aa39911b4499f95a231ae416a4601d71ed5837d2242b2c91be",
    "textSha256": "4fa42c2d00def0bca2ac87e3a6aad82dbc28ec3ed5d2e3be9c21deafe4a431d2",
    "anchors": [
      {
        "offset": 0,
        "seconds": 0,
        "source": "clip-start"
      },
      {
        "offset": 16,
        "seconds": 3.81969,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 3.40947,
        "pauseEnd": 3.81969,
        "predictedSeconds": 3.824565,
        "predictionCorrectionSeconds": -0.004875
      },
      {
        "offset": 24,
        "seconds": 6.08969,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 5.10028,
        "pauseEnd": 6.08969,
        "predictedSeconds": 6.013393,
        "predictionCorrectionSeconds": 0.076297
      },
      {
        "offset": 42,
        "seconds": 10.7788,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 9.91347,
        "pauseEnd": 10.7788,
        "predictedSeconds": 10.555799,
        "predictionCorrectionSeconds": 0.223001
      },
      {
        "offset": 58,
        "seconds": 14.5718,
        "source": "detected-pause-end",
        "punctuation": "：",
        "pauseStart": 13.8193,
        "pauseEnd": 14.5718,
        "predictedSeconds": 14.380364,
        "predictionCorrectionSeconds": 0.191436
      },
      {
        "offset": 72,
        "seconds": 18.2732,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 17.8272,
        "pauseEnd": 18.2732,
        "predictedSeconds": 17.981338,
        "predictionCorrectionSeconds": 0.291862
      },
      {
        "offset": 82,
        "seconds": 21.1276,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 20.3357,
        "pauseEnd": 21.1276,
        "predictedSeconds": 20.499667,
        "predictionCorrectionSeconds": 0.627933
      },
      {
        "offset": 97,
        "seconds": 24.336,
        "source": "clip-end"
      }
    ],
    "detectedSilences": [
      {
        "start": 0,
        "end": 0.160594,
        "duration": 0.160594
      },
      {
        "start": 1.64172,
        "end": 1.98166,
        "duration": 0.33994
      },
      {
        "start": 3.40947,
        "end": 3.81969,
        "duration": 0.41022
      },
      {
        "start": 5.10028,
        "end": 6.08969,
        "duration": 0.98941
      },
      {
        "start": 7.08241,
        "end": 7.35947,
        "duration": 0.27706
      },
      {
        "start": 8.41269,
        "end": 8.62409,
        "duration": 0.2114
      },
      {
        "start": 9.91347,
        "end": 10.7788,
        "duration": 0.86533
      },
      {
        "start": 13.8193,
        "end": 14.5718,
        "duration": 0.7525
      },
      {
        "start": 16.4147,
        "end": 16.8698,
        "duration": 0.4551
      },
      {
        "start": 17.8272,
        "end": 18.2732,
        "duration": 0.446
      },
      {
        "start": 20.3357,
        "end": 21.1276,
        "duration": 0.7919
      },
      {
        "start": 22.737,
        "end": 23.1886,
        "duration": 0.4516
      },
      {
        "start": 24.1135,
        "end": 24.3195,
        "duration": 0.206
      }
    ],
    "quality": {
      "punctuationBoundaries": 6,
      "detectedPauses": 11,
      "matchedPauses": 6,
      "meanPredictionCorrectionSeconds": 0.235901,
      "maxPredictionCorrectionSeconds": 0.627933,
      "maxUnanchoredSeconds": 4.68911
    },
    "limitations": "Measured acoustic pauses are matched heuristically to punctuation; text intervals are interpolated. This is phrase-level assistance, not word-level forced alignment."
  },
  "vents-compare": {
    "method": "silence-assisted-text-estimate/v1",
    "text": "把A、B两瓶并排，先核对它们都是水样，再核对采样方法、深度和时刻。之后才比较化验得到的同一项成分。这里展示的是采样与比较的方法；若出现数值，都会标为教学示例。还要重复取样，不能凭两瓶水就宣布找到了原因。",
    "duration": 26.244,
    "audioSha256": "50d894febe9293b4afe240c7b77ac854417c593a144c900d6bb2b2f9c2d96106",
    "textSha256": "9a2bc0bf3d75d8f461c32b1e2400887bbb7f4ba87e76e861a08d910693640d86",
    "anchors": [
      {
        "offset": 0,
        "seconds": 0,
        "source": "clip-start"
      },
      {
        "offset": 3,
        "seconds": 0.965031,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 0.745906,
        "pauseEnd": 0.965031,
        "predictedSeconds": 0.507549,
        "predictionCorrectionSeconds": 0.457482
      },
      {
        "offset": 9,
        "seconds": 1.55484,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 1.21675,
        "pauseEnd": 1.55484,
        "predictedSeconds": 1.918783,
        "predictionCorrectionSeconds": -0.363943
      },
      {
        "offset": 19,
        "seconds": 5.37031,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 4.67325,
        "pauseEnd": 5.37031,
        "predictedSeconds": 4.456528,
        "predictionCorrectionSeconds": 0.913782
      },
      {
        "offset": 27,
        "seconds": 7.02847,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 6.65538,
        "pauseEnd": 7.02847,
        "predictedSeconds": 6.338174,
        "predictionCorrectionSeconds": 0.690296
      },
      {
        "offset": 33,
        "seconds": 7.83241,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 7.58791,
        "pauseEnd": 7.83241,
        "predictedSeconds": 8.145543,
        "predictionCorrectionSeconds": -0.313133
      },
      {
        "offset": 49,
        "seconds": 12.922,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 12.3498,
        "pauseEnd": 12.922,
        "predictedSeconds": 12.428762,
        "predictionCorrectionSeconds": 0.493238
      },
      {
        "offset": 64,
        "seconds": 17.1362,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 16.3054,
        "pauseEnd": 17.1362,
        "predictedSeconds": 16.315845,
        "predictionCorrectionSeconds": 0.820355
      },
      {
        "offset": 70,
        "seconds": 18.7334,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 18.2565,
        "pauseEnd": 18.7334,
        "predictedSeconds": 17.863251,
        "predictionCorrectionSeconds": 0.870149
      },
      {
        "offset": 79,
        "seconds": 20.8638,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 20.4544,
        "pauseEnd": 20.8638,
        "predictedSeconds": 20.413375,
        "predictionCorrectionSeconds": 0.450425
      },
      {
        "offset": 86,
        "seconds": 23.0366,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 22.0482,
        "pauseEnd": 23.0366,
        "predictedSeconds": 22.208366,
        "predictionCorrectionSeconds": 0.828234
      },
      {
        "offset": 101,
        "seconds": 26.244,
        "source": "clip-end"
      }
    ],
    "detectedSilences": [
      {
        "start": 0,
        "end": 0.170094,
        "duration": 0.170094
      },
      {
        "start": 0.745906,
        "end": 0.965031,
        "duration": 0.219125
      },
      {
        "start": 1.21675,
        "end": 1.55484,
        "duration": 0.33809
      },
      {
        "start": 2.51047,
        "end": 3.14603,
        "duration": 0.63556
      },
      {
        "start": 4.67325,
        "end": 5.37031,
        "duration": 0.69706
      },
      {
        "start": 6.65538,
        "end": 7.02847,
        "duration": 0.37309
      },
      {
        "start": 7.58791,
        "end": 7.83241,
        "duration": 0.2445
      },
      {
        "start": 8.49431,
        "end": 9.37397,
        "duration": 0.87966
      },
      {
        "start": 9.83863,
        "end": 10.1067,
        "duration": 0.26807
      },
      {
        "start": 12.3498,
        "end": 12.922,
        "duration": 0.5722
      },
      {
        "start": 14.0419,
        "end": 14.3287,
        "duration": 0.2868
      },
      {
        "start": 16.3054,
        "end": 17.1362,
        "duration": 0.8308
      },
      {
        "start": 18.2565,
        "end": 18.7334,
        "duration": 0.4769
      },
      {
        "start": 20.4544,
        "end": 20.8638,
        "duration": 0.4094
      },
      {
        "start": 22.0482,
        "end": 23.0366,
        "duration": 0.9884
      },
      {
        "start": 24.2021,
        "end": 24.5682,
        "duration": 0.3661
      },
      {
        "start": 26.0368,
        "end": 26.2275,
        "duration": 0.1907
      }
    ],
    "quality": {
      "punctuationBoundaries": 10,
      "detectedPauses": 15,
      "matchedPauses": 10,
      "meanPredictionCorrectionSeconds": 0.620104,
      "maxPredictionCorrectionSeconds": 0.913782,
      "maxUnanchoredSeconds": 5.08959
    },
    "limitations": "Measured acoustic pauses are matched heuristically to punctuation; text intervals are interpolated. This is phrase-level assistance, not word-level forced alignment."
  },
  "vents-summary": {
    "method": "silence-assisted-text-estimate/v1",
    "text": "返航前把三类内容分开：热液循环、烟囱形成和化能合成，是已有科学知识；本片的喷口、管虫和样本位置，是模拟观察记录；两瓶水的成分与热液影响范围，仍需真实取样和化验才能回答。我们学会了调查方法，没有得到新的实测结论。",
    "duration": 26.712,
    "audioSha256": "117ded14c6a84f8e81bf4741cff0c55f4b8139faba9c62d6d29588a97f864e4e",
    "textSha256": "9ebc6eb7315f16022e127ccc43badae153096f95eb73f91e4c0f65f83516d0ae",
    "anchors": [
      {
        "offset": 0,
        "seconds": 0,
        "source": "clip-start"
      },
      {
        "offset": 11,
        "seconds": 3.303,
        "source": "detected-pause-end",
        "punctuation": "：",
        "pauseStart": 2.64787,
        "pauseEnd": 3.303,
        "predictedSeconds": 2.745637,
        "predictionCorrectionSeconds": 0.557363
      },
      {
        "offset": 16,
        "seconds": 4.70206,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 4.24338,
        "pauseEnd": 4.70206,
        "predictedSeconds": 3.868298,
        "predictionCorrectionSeconds": 0.833762
      },
      {
        "offset": 26,
        "seconds": 6.071,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 5.706,
        "pauseEnd": 6.071,
        "predictedSeconds": 6.369878,
        "predictionCorrectionSeconds": -0.298878
      },
      {
        "offset": 34,
        "seconds": 7.9795,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 7.09416,
        "pauseEnd": 7.9795,
        "predictedSeconds": 8.493171,
        "predictionCorrectionSeconds": -0.513671
      },
      {
        "offset": 40,
        "seconds": 10.2818,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 9.32381,
        "pauseEnd": 10.2818,
        "predictedSeconds": 9.859889,
        "predictionCorrectionSeconds": 0.421911
      },
      {
        "offset": 48,
        "seconds": 11.6568,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 11.245,
        "pauseEnd": 11.6568,
        "predictedSeconds": 11.873356,
        "predictionCorrectionSeconds": -0.216556
      },
      {
        "offset": 56,
        "seconds": 13.8554,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 13.411,
        "pauseEnd": 13.8554,
        "predictedSeconds": 13.996649,
        "predictionCorrectionSeconds": -0.141249
      },
      {
        "offset": 70,
        "seconds": 17.7566,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 17.4113,
        "pauseEnd": 17.7566,
        "predictedSeconds": 17.474456,
        "predictionCorrectionSeconds": 0.282144
      },
      {
        "offset": 84,
        "seconds": 22.6323,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 22.0553,
        "pauseEnd": 22.6323,
        "predictedSeconds": 21.208523,
        "predictionCorrectionSeconds": 1.423777
      },
      {
        "offset": 94,
        "seconds": 24.7069,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 24.0656,
        "pauseEnd": 24.7069,
        "predictedSeconds": 23.710103,
        "predictionCorrectionSeconds": 0.996797
      },
      {
        "offset": 105,
        "seconds": 26.712,
        "source": "clip-end"
      }
    ],
    "detectedSilences": [
      {
        "start": 0,
        "end": 0.152625,
        "duration": 0.152625
      },
      {
        "start": 0.989969,
        "end": 1.32238,
        "duration": 0.332411
      },
      {
        "start": 2.64787,
        "end": 3.303,
        "duration": 0.65513
      },
      {
        "start": 4.24338,
        "end": 4.70206,
        "duration": 0.45868
      },
      {
        "start": 5.706,
        "end": 6.071,
        "duration": 0.365
      },
      {
        "start": 7.09416,
        "end": 7.9795,
        "duration": 0.88534
      },
      {
        "start": 9.32381,
        "end": 10.2818,
        "duration": 0.95799
      },
      {
        "start": 11.245,
        "end": 11.6568,
        "duration": 0.4118
      },
      {
        "start": 12.2476,
        "end": 12.4565,
        "duration": 0.2089
      },
      {
        "start": 13.411,
        "end": 13.8554,
        "duration": 0.4444
      },
      {
        "start": 15.2554,
        "end": 16.1937,
        "duration": 0.9383
      },
      {
        "start": 17.4113,
        "end": 17.7566,
        "duration": 0.3453
      },
      {
        "start": 19.0847,
        "end": 19.6377,
        "duration": 0.553
      },
      {
        "start": 22.0553,
        "end": 22.6323,
        "duration": 0.577
      },
      {
        "start": 24.0656,
        "end": 24.7069,
        "duration": 0.6413
      },
      {
        "start": 26.3678,
        "end": 26.6955,
        "duration": 0.3277
      }
    ],
    "quality": {
      "punctuationBoundaries": 10,
      "detectedPauses": 14,
      "matchedPauses": 10,
      "meanPredictionCorrectionSeconds": 0.568611,
      "maxPredictionCorrectionSeconds": 1.423777,
      "maxUnanchoredSeconds": 4.8757
    },
    "limitations": "Measured acoustic pauses are matched heuristically to punctuation; text intervals are interpolated. This is phrase-level assistance, not word-level forced alignment."
  },
  "canyon-equipment": {
    "method": "silence-assisted-text-estimate/v1",
    "text": "人留在母船上，黄色遥控无人潜器不载人。灯光和相机让操作员看清海床，声呐帮助辨认方位和障碍；推进器负责移动、转向和悬停。浮力材料托住机体，耐压舱保护电子设备。脐带输送电力和指令，并把画面传回船上控制台。机械臂操作工具，随身的小型采水瓶封住水样；海底的采水站是提前布放的设备。船员用绞车放下和收回潜器。看清目标、稳住位置、操作取样，需要这套设备共同配合；画面和读数仍为教学模拟。",
    "duration": 50.04,
    "audioSha256": "600ec9d8798fd13db60b5c01a0b8fa950f9cb5379d1e6e3a8c3d00460b71b159",
    "textSha256": "9942f66dcd31b1495ccbe5c558ae1ed914b4a5b5b632ce7be169ff406f0861bb",
    "anchors": [
      {
        "offset": 0,
        "seconds": 0,
        "source": "clip-start"
      },
      {
        "offset": 7,
        "seconds": 2.16631,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 1.39666,
        "pauseEnd": 2.16631,
        "predictedSeconds": 1.827657,
        "predictionCorrectionSeconds": 0.338653
      },
      {
        "offset": 19,
        "seconds": 5.53931,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 4.53625,
        "pauseEnd": 5.53931,
        "predictedSeconds": 5.180463,
        "predictionCorrectionSeconds": 0.358847
      },
      {
        "offset": 33,
        "seconds": 9.18838,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 8.65375,
        "pauseEnd": 9.18838,
        "predictedSeconds": 8.772756,
        "predictionCorrectionSeconds": 0.415624
      },
      {
        "offset": 45,
        "seconds": 12.1083,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 11.3492,
        "pauseEnd": 12.1083,
        "predictedSeconds": 11.974307,
        "predictionCorrectionSeconds": 0.133993
      },
      {
        "offset": 53,
        "seconds": 14.2624,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 13.9385,
        "pauseEnd": 14.2624,
        "predictedSeconds": 13.890196,
        "predictionCorrectionSeconds": 0.372204
      },
      {
        "offset": 59,
        "seconds": 16.1563,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 15.6637,
        "pauseEnd": 16.1563,
        "predictedSeconds": 15.730458,
        "predictionCorrectionSeconds": 0.425842
      },
      {
        "offset": 68,
        "seconds": 18.8906,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 18.0258,
        "pauseEnd": 18.8906,
        "predictedSeconds": 18.062297,
        "predictionCorrectionSeconds": 0.828303
      },
      {
        "offset": 78,
        "seconds": 20.9648,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 20.498,
        "pauseEnd": 20.9648,
        "predictedSeconds": 20.910922,
        "predictionCorrectionSeconds": 0.053878
      },
      {
        "offset": 88,
        "seconds": 24.064,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 23.2026,
        "pauseEnd": 24.064,
        "predictedSeconds": 23.494851,
        "predictionCorrectionSeconds": 0.569149
      },
      {
        "offset": 100,
        "seconds": 27.0986,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 26.3659,
        "pauseEnd": 27.0986,
        "predictedSeconds": 26.847657,
        "predictionCorrectionSeconds": 0.250943
      },
      {
        "offset": 108,
        "seconds": 29.0917,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 28.4468,
        "pauseEnd": 29.0917,
        "predictedSeconds": 28.927406,
        "predictionCorrectionSeconds": 0.164294
      },
      {
        "offset": 121,
        "seconds": 32.6892,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 31.8011,
        "pauseEnd": 32.6892,
        "predictedSeconds": 32.381048,
        "predictionCorrectionSeconds": 0.308152
      },
      {
        "offset": 136,
        "seconds": 36.7153,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 35.6697,
        "pauseEnd": 36.7153,
        "predictedSeconds": 36.490126,
        "predictionCorrectionSeconds": 0.225174
      },
      {
        "offset": 149,
        "seconds": 40.1169,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 39.6267,
        "pauseEnd": 40.1169,
        "predictedSeconds": 40.095023,
        "predictionCorrectionSeconds": 0.021877
      },
      {
        "offset": 154,
        "seconds": 41.4747,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 41.0452,
        "pauseEnd": 41.4747,
        "predictedSeconds": 41.25464,
        "predictionCorrectionSeconds": 0.22006
      },
      {
        "offset": 159,
        "seconds": 42.8326,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 42.2698,
        "pauseEnd": 42.8326,
        "predictedSeconds": 42.414257,
        "predictionCorrectionSeconds": 0.418343
      },
      {
        "offset": 164,
        "seconds": 44.4464,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 43.7052,
        "pauseEnd": 44.4464,
        "predictedSeconds": 43.737733,
        "predictionCorrectionSeconds": 0.708667
      },
      {
        "offset": 175,
        "seconds": 47.1993,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 46.4889,
        "pauseEnd": 47.1993,
        "predictedSeconds": 46.687194,
        "predictionCorrectionSeconds": 0.512106
      },
      {
        "offset": 187,
        "seconds": 50.04,
        "source": "clip-end"
      }
    ],
    "detectedSilences": [
      {
        "start": 0,
        "end": 0.197969,
        "duration": 0.197969
      },
      {
        "start": 1.39666,
        "end": 2.16631,
        "duration": 0.76965
      },
      {
        "start": 4.53625,
        "end": 5.53931,
        "duration": 1.00306
      },
      {
        "start": 6.65181,
        "end": 6.94538,
        "duration": 0.29357
      },
      {
        "start": 8.65375,
        "end": 9.18838,
        "duration": 0.53463
      },
      {
        "start": 11.3492,
        "end": 12.1083,
        "duration": 0.7591
      },
      {
        "start": 12.8528,
        "end": 13.1578,
        "duration": 0.305
      },
      {
        "start": 13.9385,
        "end": 14.2624,
        "duration": 0.3239
      },
      {
        "start": 14.7806,
        "end": 15.0148,
        "duration": 0.2342
      },
      {
        "start": 15.6637,
        "end": 16.1563,
        "duration": 0.4926
      },
      {
        "start": 18.0258,
        "end": 18.8906,
        "duration": 0.8648
      },
      {
        "start": 20.498,
        "end": 20.9648,
        "duration": 0.4668
      },
      {
        "start": 22.3139,
        "end": 22.5873,
        "duration": 0.2734
      },
      {
        "start": 23.2026,
        "end": 24.064,
        "duration": 0.8614
      },
      {
        "start": 24.8656,
        "end": 25.0152,
        "duration": 0.1496
      },
      {
        "start": 26.3659,
        "end": 27.0986,
        "duration": 0.7327
      },
      {
        "start": 28.4468,
        "end": 29.0917,
        "duration": 0.6449
      },
      {
        "start": 30.7096,
        "end": 31.0809,
        "duration": 0.3713
      },
      {
        "start": 31.8011,
        "end": 32.6892,
        "duration": 0.8881
      },
      {
        "start": 33.897,
        "end": 34.2809,
        "duration": 0.3839
      },
      {
        "start": 35.6697,
        "end": 36.7153,
        "duration": 1.0456
      },
      {
        "start": 37.2797,
        "end": 37.4019,
        "duration": 0.1222
      },
      {
        "start": 38.4139,
        "end": 38.6252,
        "duration": 0.2113
      },
      {
        "start": 39.6267,
        "end": 40.1169,
        "duration": 0.4902
      },
      {
        "start": 41.0452,
        "end": 41.4747,
        "duration": 0.4295
      },
      {
        "start": 42.2698,
        "end": 42.8326,
        "duration": 0.5628
      },
      {
        "start": 43.7052,
        "end": 44.4464,
        "duration": 0.7412
      },
      {
        "start": 46.4889,
        "end": 47.1993,
        "duration": 0.7104
      },
      {
        "start": 48.322,
        "end": 48.6395,
        "duration": 0.3175
      },
      {
        "start": 49.7449,
        "end": 50.0235,
        "duration": 0.2786
      }
    ],
    "quality": {
      "punctuationBoundaries": 18,
      "detectedPauses": 26,
      "matchedPauses": 18,
      "meanPredictionCorrectionSeconds": 0.351451,
      "maxPredictionCorrectionSeconds": 0.828303,
      "maxUnanchoredSeconds": 4.0261
    },
    "limitations": "Measured acoustic pauses are matched heuristically to punctuation; text intervals are interpolated. This is phrase-level assistance, not word-level forced alignment."
  },
  "canyon-habitat": {
    "method": "silence-assisted-text-estimate/v1",
    "text": "栖息地不只是一个地名，还包括生物附着的表面、水体条件和食物怎样到达。岩壁与泥底提供不同表面，水流可以带来食物。我们先把这些情况记录下来；不能只看模型，就断定某种地形一定决定了哪种生物生活在这里。",
    "duration": 25.344,
    "audioSha256": "18298383450aa4dc9ce3b8f00de4827d32304808dedc4ca01e94f5adc1841a4d",
    "textSha256": "3085d26f7ee64baeba4fd379875543d23a4a35b4bd498cd36bbd6510ebf4970e",
    "anchors": [
      {
        "offset": 0,
        "seconds": 0,
        "source": "clip-start"
      },
      {
        "offset": 11,
        "seconds": 3.40366,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 2.71803,
        "pauseEnd": 3.40366,
        "predictedSeconds": 2.796665,
        "predictionCorrectionSeconds": 0.606995
      },
      {
        "offset": 34,
        "seconds": 8.93922,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 8.72378,
        "pauseEnd": 8.93922,
        "predictedSeconds": 8.738025,
        "predictionCorrectionSeconds": 0.201195
      },
      {
        "offset": 46,
        "seconds": 12.4102,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 12.0723,
        "pauseEnd": 12.4102,
        "predictedSeconds": 11.783282,
        "predictionCorrectionSeconds": 0.626918
      },
      {
        "offset": 55,
        "seconds": 14.3966,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 13.564,
        "pauseEnd": 14.3966,
        "predictedSeconds": 14.343784,
        "predictionCorrectionSeconds": 0.052816
      },
      {
        "offset": 75,
        "seconds": 19.3665,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 18.5528,
        "pauseEnd": 19.3665,
        "predictedSeconds": 19.551796,
        "predictionCorrectionSeconds": -0.185296
      },
      {
        "offset": 97,
        "seconds": 25.344,
        "source": "clip-end"
      }
    ],
    "detectedSilences": [
      {
        "start": 0,
        "end": 0.215219,
        "duration": 0.215219
      },
      {
        "start": 1.06038,
        "end": 1.50456,
        "duration": 0.44418
      },
      {
        "start": 2.71803,
        "end": 3.40366,
        "duration": 0.68563
      },
      {
        "start": 4.20069,
        "end": 4.49331,
        "duration": 0.29262
      },
      {
        "start": 5.95659,
        "end": 6.56897,
        "duration": 0.61238
      },
      {
        "start": 7.52672,
        "end": 8.02172,
        "duration": 0.495
      },
      {
        "start": 8.72378,
        "end": 8.93922,
        "duration": 0.21544
      },
      {
        "start": 9.77,
        "end": 10.674,
        "duration": 0.904
      },
      {
        "start": 11.2537,
        "end": 11.3687,
        "duration": 0.115
      },
      {
        "start": 12.0723,
        "end": 12.4102,
        "duration": 0.3379
      },
      {
        "start": 13.564,
        "end": 14.3966,
        "duration": 0.8326
      },
      {
        "start": 16.1451,
        "end": 16.51,
        "duration": 0.3649
      },
      {
        "start": 18.5528,
        "end": 19.3665,
        "duration": 0.8137
      },
      {
        "start": 20.5544,
        "end": 20.8939,
        "duration": 0.3395
      },
      {
        "start": 22.2615,
        "end": 22.539,
        "duration": 0.2775
      },
      {
        "start": 24.9702,
        "end": 25.3275,
        "duration": 0.3573
      }
    ],
    "quality": {
      "punctuationBoundaries": 7,
      "detectedPauses": 13,
      "matchedPauses": 5,
      "meanPredictionCorrectionSeconds": 0.334644,
      "maxPredictionCorrectionSeconds": 0.626918,
      "maxUnanchoredSeconds": 5.9775
    },
    "limitations": "Measured acoustic pauses are matched heuristically to punctuation; text intervals are interpolated. This is phrase-level assistance, not word-level forced alignment."
  },
  "canyon-compare": {
    "method": "silence-assisted-text-estimate/v1",
    "text": "两瓶水摆在一起，先核对介质和方法，再看站位、深度与时刻。真正的成分差异要靠同一种检测方法得到。这里的表格是教学演示，即使出现示例数字，也不是刚测出的结果。它帮助我们提出下一次调查要控制什么，而不能替代证据。",
    "duration": 25.488,
    "audioSha256": "4ac5c2d1235b69d84c5b63d2dbab104f0d9035fae0527e55fad0cbabe3bb3504",
    "textSha256": "783f585b6c7f6f03eb589f9a91c6d1df467f6e82d673116dea229512913a48c3",
    "anchors": [
      {
        "offset": 0,
        "seconds": 0,
        "source": "clip-start"
      },
      {
        "offset": 8,
        "seconds": 2.24278,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 1.60472,
        "pauseEnd": 2.24278,
        "predictedSeconds": 1.928253,
        "predictionCorrectionSeconds": 0.314527
      },
      {
        "offset": 17,
        "seconds": 4.50097,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 3.81984,
        "pauseEnd": 4.50097,
        "predictedSeconds": 4.090234,
        "predictionCorrectionSeconds": 0.410736
      },
      {
        "offset": 22,
        "seconds": 5.60431,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 5.27319,
        "pauseEnd": 5.60431,
        "predictedSeconds": 5.165381,
        "predictionCorrectionSeconds": 0.438929
      },
      {
        "offset": 28,
        "seconds": 6.48569,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 6.19763,
        "pauseEnd": 6.48569,
        "predictedSeconds": 6.871593,
        "predictionCorrectionSeconds": -0.385903
      },
      {
        "offset": 47,
        "seconds": 12.3437,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 11.7377,
        "pauseEnd": 12.3437,
        "predictedSeconds": 11.616264,
        "predictionCorrectionSeconds": 0.727436
      },
      {
        "offset": 58,
        "seconds": 13.5698,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 13.382,
        "pauseEnd": 13.5698,
        "predictedSeconds": 14.2457,
        "predictionCorrectionSeconds": -0.6759
      },
      {
        "offset": 67,
        "seconds": 15.6258,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 15.266,
        "pauseEnd": 15.6258,
        "predictedSeconds": 16.407681,
        "predictionCorrectionSeconds": -0.781881
      },
      {
        "offset": 77,
        "seconds": 19.6835,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 19.3143,
        "pauseEnd": 19.6835,
        "predictedSeconds": 19.048803,
        "predictionCorrectionSeconds": 0.634697
      },
      {
        "offset": 95,
        "seconds": 24.084,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 23.2814,
        "pauseEnd": 24.084,
        "predictedSeconds": 23.314333,
        "predictionCorrectionSeconds": 0.769667
      },
      {
        "offset": 103,
        "seconds": 25.488,
        "source": "clip-end"
      }
    ],
    "detectedSilences": [
      {
        "start": 0,
        "end": 0.173219,
        "duration": 0.173219
      },
      {
        "start": 1.60472,
        "end": 2.24278,
        "duration": 0.63806
      },
      {
        "start": 3.81984,
        "end": 4.50097,
        "duration": 0.68113
      },
      {
        "start": 5.27319,
        "end": 5.60431,
        "duration": 0.33112
      },
      {
        "start": 6.19763,
        "end": 6.48569,
        "duration": 0.28806
      },
      {
        "start": 7.17138,
        "end": 8.04841,
        "duration": 0.87703
      },
      {
        "start": 9.32659,
        "end": 9.82719,
        "duration": 0.5006
      },
      {
        "start": 11.7377,
        "end": 12.3437,
        "duration": 0.606
      },
      {
        "start": 13.382,
        "end": 13.5698,
        "duration": 0.1878
      },
      {
        "start": 14.6871,
        "end": 15.2657,
        "duration": 0.5786
      },
      {
        "start": 15.266,
        "end": 15.6258,
        "duration": 0.3598
      },
      {
        "start": 17.1739,
        "end": 17.7678,
        "duration": 0.5939
      },
      {
        "start": 19.3143,
        "end": 19.6835,
        "duration": 0.3692
      },
      {
        "start": 20.9718,
        "end": 21.2661,
        "duration": 0.2943
      },
      {
        "start": 22.2659,
        "end": 22.4691,
        "duration": 0.2032
      },
      {
        "start": 23.2814,
        "end": 24.084,
        "duration": 0.8026
      },
      {
        "start": 25.2548,
        "end": 25.4715,
        "duration": 0.2167
      }
    ],
    "quality": {
      "punctuationBoundaries": 9,
      "detectedPauses": 15,
      "matchedPauses": 9,
      "meanPredictionCorrectionSeconds": 0.571075,
      "maxPredictionCorrectionSeconds": 0.781881,
      "maxUnanchoredSeconds": 5.85801
    },
    "limitations": "Measured acoustic pauses are matched heuristically to punctuation; text intervals are interpolated. This is phrase-level assistance, not word-level forced alignment."
  },
  "canyon-summary": {
    "method": "silence-assisted-text-estimate/v1",
    "text": "现在整理收获：珊瑚和海绵能从水中获取食物，这是已有知识；模型里的外形、站点和两瓶水，是本片的模拟观察；哪种水体条件影响了群落分布，仍需要真实检测和更多站点。不能凭一段影片或几项模拟读数，就宣布找到了原因。",
    "duration": 26.316,
    "audioSha256": "708ee614c3ed6de934dccfc5626360e5bb7c0420256d988dfeff604534b20794",
    "textSha256": "a742cf32d134c6dd86d3fe8aafa9f3451fa1d4e21ebbd78b0ec997492e75c7de",
    "anchors": [
      {
        "offset": 0,
        "seconds": 0,
        "source": "clip-start"
      },
      {
        "offset": 7,
        "seconds": 2.06894,
        "source": "detected-pause-end",
        "punctuation": "：",
        "pauseStart": 1.20572,
        "pauseEnd": 2.06894,
        "predictedSeconds": 1.785597,
        "predictionCorrectionSeconds": 0.283343
      },
      {
        "offset": 21,
        "seconds": 6.19487,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 5.54872,
        "pauseEnd": 6.19487,
        "predictedSeconds": 5.295218,
        "predictionCorrectionSeconds": 0.899652
      },
      {
        "offset": 28,
        "seconds": 6.55997,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 6.19506,
        "pauseEnd": 6.55997,
        "predictedSeconds": 7.191644,
        "predictionCorrectionSeconds": -0.631674
      },
      {
        "offset": 35,
        "seconds": 8.56222,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 7.59416,
        "pauseEnd": 8.56222,
        "predictedSeconds": 8.817153,
        "predictionCorrectionSeconds": -0.254933
      },
      {
        "offset": 42,
        "seconds": 10.8046,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 10.4078,
        "pauseEnd": 10.8046,
        "predictedSeconds": 10.60275,
        "predictionCorrectionSeconds": 0.20185
      },
      {
        "offset": 51,
        "seconds": 12.1845,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 11.5467,
        "pauseEnd": 12.1845,
        "predictedSeconds": 12.991755,
        "predictionCorrectionSeconds": -0.807255
      },
      {
        "offset": 65,
        "seconds": 16.2091,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 15.8743,
        "pauseEnd": 16.2091,
        "predictedSeconds": 16.501376,
        "predictionCorrectionSeconds": -0.292276
      },
      {
        "offset": 78,
        "seconds": 19.7248,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 19.4432,
        "pauseEnd": 19.7248,
        "predictedSeconds": 20.023311,
        "predictionCorrectionSeconds": -0.298511
      },
      {
        "offset": 93,
        "seconds": 24.5785,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 24.2573,
        "pauseEnd": 24.5785,
        "predictedSeconds": 23.779221,
        "predictionCorrectionSeconds": 0.799279
      },
      {
        "offset": 102,
        "seconds": 26.316,
        "source": "clip-end"
      }
    ],
    "detectedSilences": [
      {
        "start": 0,
        "end": 0.181063,
        "duration": 0.181063
      },
      {
        "start": 1.20572,
        "end": 2.06894,
        "duration": 0.86322
      },
      {
        "start": 3.31291,
        "end": 3.86297,
        "duration": 0.55006
      },
      {
        "start": 5.54872,
        "end": 6.19487,
        "duration": 0.64615
      },
      {
        "start": 6.19506,
        "end": 6.55997,
        "duration": 0.36491
      },
      {
        "start": 7.59416,
        "end": 8.56222,
        "duration": 0.96806
      },
      {
        "start": 9.68778,
        "end": 9.96862,
        "duration": 0.28084
      },
      {
        "start": 10.4078,
        "end": 10.8046,
        "duration": 0.3968
      },
      {
        "start": 11.5467,
        "end": 12.1845,
        "duration": 0.6378
      },
      {
        "start": 13.5847,
        "end": 14.6388,
        "duration": 1.0541
      },
      {
        "start": 15.8743,
        "end": 16.2091,
        "duration": 0.3348
      },
      {
        "start": 17.4336,
        "end": 17.9531,
        "duration": 0.5195
      },
      {
        "start": 19.4432,
        "end": 19.7248,
        "duration": 0.2816
      },
      {
        "start": 20.6149,
        "end": 21.118,
        "duration": 0.5031
      },
      {
        "start": 22.5076,
        "end": 22.8251,
        "duration": 0.3175
      },
      {
        "start": 24.2573,
        "end": 24.5785,
        "duration": 0.3212
      },
      {
        "start": 25.915,
        "end": 26.2995,
        "duration": 0.3845
      }
    ],
    "quality": {
      "punctuationBoundaries": 9,
      "detectedPauses": 15,
      "matchedPauses": 9,
      "meanPredictionCorrectionSeconds": 0.49653,
      "maxPredictionCorrectionSeconds": 0.899652,
      "maxUnanchoredSeconds": 4.8537
    },
    "limitations": "Measured acoustic pauses are matched heuristically to punctuation; text intervals are interpolated. This is phrase-level assistance, not word-level forced alignment."
  }
});
