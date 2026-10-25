// SPDX-License-Identifier: GPL-3.0-only
// Generated locally from unchanged MP3 pauses and exact public narration text.
// Approximate phrase timing, NOT word-level forced alignment.
const freezeDeep=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freezeDeep);Object.freeze(value);}return value;};
export const environmentCueTimingInfo = freezeDeep({
  "schema": "abyss-environment-cue-timing/v1",
  "method": "silence-assisted-text-estimate/v1",
  "detector": {
    "tool": "ffmpeg silencedetect",
    "noiseDb": -42,
    "minimumSeconds": 0.1,
    "minimumMatchedPauseSeconds": 0.18
  },
  "limitations": "Acoustic pauses are measured, but their association with punctuation is heuristic. Text between matched pauses is interpolated; this is not word-level forced alignment and has no guaranteed word-timing error bound. Browser MP3 padding can introduce a small additional clock offset."
});
export const environmentCueTiming = freezeDeep({
  "env-vents-overview": {
    "method": "silence-assisted-text-estimate/v1",
    "text": "你现在来到热液之境，是一片设定在约两千六百米深的虚构火山岩脊，不是峡谷回声里的深槽和谷壁。这里用玄武岩台地、裂隙和喷口，说明地下热液怎样进入海洋。地貌没有对应真实海域，纵向比例也经过压缩；驾驶台的模型坐标，不能直接换算成真实水深。",
    "duration": 28.116,
    "audioSha256": "acac9cb672ee90a3a5ac3d23bfd2c6f71199e39a147c561a687dbc2bbca18551",
    "textSha256": "bb95905314d41afa9be7ba3cb2f086d5ae31c5277d172d1f9e3fc43483199d34",
    "anchors": [
      {
        "offset": 0,
        "seconds": 0,
        "source": "clip-start"
      },
      {
        "offset": 10,
        "seconds": 2.41962,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 1.87216,
        "pauseEnd": 2.41962,
        "predictedSeconds": 2.392603,
        "predictionCorrectionSeconds": 0.027017
      },
      {
        "offset": 31,
        "seconds": 7.49575,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 6.76025,
        "pauseEnd": 7.49575,
        "predictedSeconds": 7.352877,
        "predictionCorrectionSeconds": 0.142873
      },
      {
        "offset": 45,
        "seconds": 11.0162,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 10.3282,
        "pauseEnd": 11.0162,
        "predictedSeconds": 10.924274,
        "predictionCorrectionSeconds": 0.091926
      },
      {
        "offset": 54,
        "seconds": 13.2002,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 12.6741,
        "pauseEnd": 13.2002,
        "predictedSeconds": 12.931726,
        "predictionCorrectionSeconds": 0.268474
      },
      {
        "offset": 60,
        "seconds": 14.0388,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 13.7342,
        "pauseEnd": 14.0388,
        "predictedSeconds": 14.39063,
        "predictionCorrectionSeconds": -0.35183
      },
      {
        "offset": 73,
        "seconds": 18.3003,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 17.8886,
        "pauseEnd": 18.3003,
        "predictedSeconds": 17.728603,
        "predictionCorrectionSeconds": 0.571697
      },
      {
        "offset": 84,
        "seconds": 20.8633,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 20.1873,
        "pauseEnd": 20.8633,
        "predictedSeconds": 20.35463,
        "predictionCorrectionSeconds": 0.50867
      },
      {
        "offset": 94,
        "seconds": 22.0002,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 21.7913,
        "pauseEnd": 22.0002,
        "predictedSeconds": 22.852274,
        "predictionCorrectionSeconds": -0.852074
      },
      {
        "offset": 103,
        "seconds": 25.87,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 25.4291,
        "pauseEnd": 25.87,
        "predictedSeconds": 25.011452,
        "predictionCorrectionSeconds": 0.858548
      },
      {
        "offset": 115,
        "seconds": 28.116,
        "source": "clip-end"
      }
    ],
    "quality": {
      "punctuationBoundaries": 9,
      "detectedPauses": 13,
      "matchedPauses": 9,
      "meanPredictionCorrectionSeconds": 0.408123,
      "maxPredictionCorrectionSeconds": 0.858548,
      "maxUnanchoredSeconds": 5.07613
    },
    "detectedSilences": [
      {
        "start": 0,
        "end": 0.201313,
        "duration": 0.201313
      },
      {
        "start": 1.87216,
        "end": 2.41962,
        "duration": 0.54746
      },
      {
        "start": 5.23791,
        "end": 5.50962,
        "duration": 0.27171
      },
      {
        "start": 6.76025,
        "end": 7.49575,
        "duration": 0.7355
      },
      {
        "start": 9.48881,
        "end": 9.64953,
        "duration": 0.16072
      },
      {
        "start": 10.0043,
        "end": 10.1132,
        "duration": 0.1089
      },
      {
        "start": 10.3282,
        "end": 11.0162,
        "duration": 0.688
      },
      {
        "start": 12.6741,
        "end": 13.2002,
        "duration": 0.5261
      },
      {
        "start": 13.7342,
        "end": 14.0388,
        "duration": 0.3046
      },
      {
        "start": 14.704,
        "end": 15.2605,
        "duration": 0.5565
      },
      {
        "start": 16.5158,
        "end": 16.743,
        "duration": 0.2272
      },
      {
        "start": 17.8886,
        "end": 18.3003,
        "duration": 0.4117
      },
      {
        "start": 20.1873,
        "end": 20.8633,
        "duration": 0.676
      },
      {
        "start": 21.7913,
        "end": 22.0002,
        "duration": 0.2089
      },
      {
        "start": 22.9136,
        "end": 23.9358,
        "duration": 1.0222
      },
      {
        "start": 25.4291,
        "end": 25.87,
        "duration": 0.4409
      },
      {
        "start": 27.908,
        "end": 28.0995,
        "duration": 0.1915
      }
    ],
    "limitations": "Acoustic pauses are measured, but their association with punctuation is heuristic. Text between matched pauses is interpolated; this is not word-level forced alignment and has no guaranteed word-timing error bound. Browser MP3 padding can introduce a small additional clock offset."
  },
  "env-vents-water": {
    "method": "silence-assisted-text-estimate/v1",
    "text": "热液之境首先仍是深海：阳光照不到这里，周围海水通常寒冷，水压随水深增加。喷口附近有热流，不等于整片海都是热水，也不代表海水没有氧气。热液与冷海水混合，会让不同位置的条件很不一样。画面里的灯光帮助我们观察，温度和坐标读数只是教学设定，不能代替传感器测量。",
    "duration": 30.636,
    "audioSha256": "8d3bcbf1b56357e4285fcdc305605bcfd8af0297e89bcbbc17b37a4af94ce478",
    "textSha256": "6483ae0290fe9bfe5e4507df24d5bd6164a6b820189cecde9f175fd3207ea604",
    "anchors": [
      {
        "offset": 0,
        "seconds": 0,
        "source": "clip-start"
      },
      {
        "offset": 11,
        "seconds": 3.25825,
        "source": "detected-pause-end",
        "punctuation": "：",
        "pauseStart": 2.47053,
        "pauseEnd": 3.25825,
        "predictedSeconds": 2.5875,
        "predictionCorrectionSeconds": 0.67075
      },
      {
        "offset": 19,
        "seconds": 5.2375,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 4.46684,
        "pauseEnd": 5.2375,
        "predictedSeconds": 4.485,
        "predictionCorrectionSeconds": 0.7525
      },
      {
        "offset": 36,
        "seconds": 7.66375,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 7.00594,
        "pauseEnd": 7.66375,
        "predictedSeconds": 8.7515,
        "predictionCorrectionSeconds": -1.08775
      },
      {
        "offset": 44,
        "seconds": 9.98456,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 9.28719,
        "pauseEnd": 9.98456,
        "predictedSeconds": 10.649,
        "predictionCorrectionSeconds": -0.66444
      },
      {
        "offset": 55,
        "seconds": 12.1821,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 11.4275,
        "pauseEnd": 12.1821,
        "predictedSeconds": 13.2365,
        "predictionCorrectionSeconds": -1.0544
      },
      {
        "offset": 66,
        "seconds": 15.8131,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 15.4954,
        "pauseEnd": 15.8131,
        "predictedSeconds": 16.0655,
        "predictionCorrectionSeconds": -0.2524
      },
      {
        "offset": 75,
        "seconds": 17.4081,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 17.0175,
        "pauseEnd": 17.4081,
        "predictedSeconds": 18.193,
        "predictionCorrectionSeconds": -0.7849
      },
      {
        "offset": 89,
        "seconds": 22.6162,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 22.0951,
        "pauseEnd": 22.6162,
        "predictedSeconds": 21.712,
        "predictionCorrectionSeconds": 0.9042
      },
      {
        "offset": 102,
        "seconds": 24.1136,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 23.8233,
        "pauseEnd": 24.1136,
        "predictedSeconds": 24.7595,
        "predictionCorrectionSeconds": -0.6459
      },
      {
        "offset": 116,
        "seconds": 28.8634,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 28.2366,
        "pauseEnd": 28.8634,
        "predictedSeconds": 28.037,
        "predictionCorrectionSeconds": 0.8264
      },
      {
        "offset": 126,
        "seconds": 30.636,
        "source": "clip-end"
      }
    ],
    "quality": {
      "punctuationBoundaries": 11,
      "detectedPauses": 13,
      "matchedPauses": 10,
      "meanPredictionCorrectionSeconds": 0.764364,
      "maxPredictionCorrectionSeconds": 1.08775,
      "maxUnanchoredSeconds": 5.2081
    },
    "detectedSilences": [
      {
        "start": 0,
        "end": 0.163062,
        "duration": 0.163062
      },
      {
        "start": 2.47053,
        "end": 3.25825,
        "duration": 0.78772
      },
      {
        "start": 4.46684,
        "end": 5.2375,
        "duration": 0.77066
      },
      {
        "start": 7.00594,
        "end": 7.66375,
        "duration": 0.65781
      },
      {
        "start": 9.28719,
        "end": 9.98456,
        "duration": 0.69737
      },
      {
        "start": 11.4275,
        "end": 12.1821,
        "duration": 0.7546
      },
      {
        "start": 14.1182,
        "end": 14.8123,
        "duration": 0.6941
      },
      {
        "start": 15.4954,
        "end": 15.8131,
        "duration": 0.3177
      },
      {
        "start": 17.0175,
        "end": 17.4081,
        "duration": 0.3906
      },
      {
        "start": 19.1927,
        "end": 19.8041,
        "duration": 0.6114
      },
      {
        "start": 22.0951,
        "end": 22.6162,
        "duration": 0.5211
      },
      {
        "start": 23.8233,
        "end": 24.1136,
        "duration": 0.2903
      },
      {
        "start": 26.7024,
        "end": 27.1722,
        "duration": 0.4698
      },
      {
        "start": 28.2366,
        "end": 28.8634,
        "duration": 0.6268
      },
      {
        "start": 30.4702,
        "end": 30.6195,
        "duration": 0.1493
      }
    ],
    "limitations": "Acoustic pauses are measured, but their association with punctuation is heuristic. Text between matched pauses is interpolated; this is not word-level forced alignment and has no guaranteed word-timing error bound. Browser MP3 padding can introduce a small additional clock offset."
  },
  "env-vents-circulation": {
    "method": "silence-assisted-text-estimate/v1",
    "text": "在热液之境，玄武岩台地上的裂隙代表海水进入地下的通道。真实热液系统中，海水沿裂缝下渗，被地下热岩石加热，并与周围岩石反应，带上溶解的物质，再沿通道上涌。热液是这种水，喷口是它返回海洋的出口；看见一条裂缝，并不能证明那里正在喷热水。",
    "duration": 28.872,
    "audioSha256": "665cf2c0bdd1271f2fe91d268c2efa2acaff9036a33fd8db3cf3a42e09b8d587",
    "textSha256": "a25b18618161663cadbda1a2dd1a49dd8525a94a50615abd4cc4dd7058f18358",
    "anchors": [
      {
        "offset": 0,
        "seconds": 0,
        "source": "clip-start"
      },
      {
        "offset": 6,
        "seconds": 1.81575,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 1.13744,
        "pauseEnd": 1.81575,
        "predictedSeconds": 1.483964,
        "predictionCorrectionSeconds": 0.331786
      },
      {
        "offset": 27,
        "seconds": 6.80934,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 6.37544,
        "pauseEnd": 6.80934,
        "predictedSeconds": 6.778747,
        "predictionCorrectionSeconds": 0.030593
      },
      {
        "offset": 35,
        "seconds": 8.79878,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 8.253,
        "pauseEnd": 8.79878,
        "predictedSeconds": 8.737579,
        "predictionCorrectionSeconds": 0.061201
      },
      {
        "offset": 43,
        "seconds": 11.0396,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 10.4009,
        "pauseEnd": 11.0396,
        "predictedSeconds": 10.696411,
        "predictionCorrectionSeconds": 0.343189
      },
      {
        "offset": 52,
        "seconds": 13.2042,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 12.5457,
        "pauseEnd": 13.2042,
        "predictedSeconds": 12.892678,
        "predictionCorrectionSeconds": 0.311522
      },
      {
        "offset": 61,
        "seconds": 15.3208,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 14.656,
        "pauseEnd": 15.3208,
        "predictedSeconds": 15.088944,
        "predictionCorrectionSeconds": 0.231856
      },
      {
        "offset": 69,
        "seconds": 17.0728,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 16.4897,
        "pauseEnd": 17.0728,
        "predictedSeconds": 17.047776,
        "predictionCorrectionSeconds": 0.025024
      },
      {
        "offset": 76,
        "seconds": 18.6289,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 18.2218,
        "pauseEnd": 18.6289,
        "predictedSeconds": 19.01848,
        "predictionCorrectionSeconds": -0.38958
      },
      {
        "offset": 83,
        "seconds": 20.7307,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 19.9489,
        "pauseEnd": 20.7307,
        "predictedSeconds": 20.739878,
        "predictionCorrectionSeconds": -0.009178
      },
      {
        "offset": 95,
        "seconds": 24.6156,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 23.5112,
        "pauseEnd": 24.6156,
        "predictedSeconds": 23.755293,
        "predictionCorrectionSeconds": 0.860307
      },
      {
        "offset": 102,
        "seconds": 26.4386,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 25.7458,
        "pauseEnd": 26.4386,
        "predictedSeconds": 25.476691,
        "predictionCorrectionSeconds": 0.961909
      },
      {
        "offset": 115,
        "seconds": 28.872,
        "source": "clip-end"
      }
    ],
    "quality": {
      "punctuationBoundaries": 11,
      "detectedPauses": 13,
      "matchedPauses": 11,
      "meanPredictionCorrectionSeconds": 0.323286,
      "maxPredictionCorrectionSeconds": 0.961909,
      "maxUnanchoredSeconds": 4.99359
    },
    "detectedSilences": [
      {
        "start": 0,
        "end": 0.149344,
        "duration": 0.149344
      },
      {
        "start": 1.13744,
        "end": 1.81575,
        "duration": 0.67831
      },
      {
        "start": 3.71116,
        "end": 4.22847,
        "duration": 0.51731
      },
      {
        "start": 6.37544,
        "end": 6.80934,
        "duration": 0.4339
      },
      {
        "start": 8.253,
        "end": 8.79878,
        "duration": 0.54578
      },
      {
        "start": 10.4009,
        "end": 11.0396,
        "duration": 0.6387
      },
      {
        "start": 12.5457,
        "end": 13.2042,
        "duration": 0.6585
      },
      {
        "start": 14.656,
        "end": 15.3208,
        "duration": 0.6648
      },
      {
        "start": 16.4897,
        "end": 17.0728,
        "duration": 0.5831
      },
      {
        "start": 18.2218,
        "end": 18.6289,
        "duration": 0.4071
      },
      {
        "start": 19.9489,
        "end": 20.7307,
        "duration": 0.7818
      },
      {
        "start": 21.3301,
        "end": 21.6802,
        "duration": 0.3501
      },
      {
        "start": 23.5112,
        "end": 24.6156,
        "duration": 1.1044
      },
      {
        "start": 25.7458,
        "end": 26.4386,
        "duration": 0.6928
      },
      {
        "start": 27.2782,
        "end": 27.4534,
        "duration": 0.1752
      },
      {
        "start": 28.6294,
        "end": 28.8555,
        "duration": 0.2261
      }
    ],
    "limitations": "Acoustic pauses are measured, but their association with punctuation is heuristic. Text between matched pauses is interpolated; this is not word-level forced alignment and has no guaranteed word-timing error bound. Browser MP3 padding can introduce a small additional clock offset."
  },
  "env-vents-minerals": {
    "method": "silence-assisted-text-estimate/v1",
    "text": "热液之境的黑烟囱，不是在海底燃烧。含有溶解物质的热液从出口流出，与冷海水混合后，一些矿物形成细小固体颗粒，悬浮起来像黑烟；另一些矿物沉在出口周围，逐渐垒成烟囱。黑色羽流、流动的水和固体岩柱要分开看，不能凭颜色判断水温或具体成分。",
    "duration": 29.484,
    "audioSha256": "a8f0f6dc2438a4cccc186b143de73d4880adb34997d0efdfe8c39071c5d03093",
    "textSha256": "ca05ecf9f0e1cb484c4602b7ef9f4ee45bb8defccd5573a3896158f848ab36bc",
    "anchors": [
      {
        "offset": 0,
        "seconds": 0,
        "source": "clip-start"
      },
      {
        "offset": 9,
        "seconds": 2.3925,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 1.75681,
        "pauseEnd": 2.3925,
        "predictedSeconds": 2.278421,
        "predictionCorrectionSeconds": 0.114079
      },
      {
        "offset": 17,
        "seconds": 4.22297,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 3.67266,
        "pauseEnd": 4.22297,
        "predictedSeconds": 4.569158,
        "predictionCorrectionSeconds": -0.346188
      },
      {
        "offset": 32,
        "seconds": 8.34284,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 7.44428,
        "pauseEnd": 8.34284,
        "predictedSeconds": 8.325474,
        "predictionCorrectionSeconds": 0.017366
      },
      {
        "offset": 40,
        "seconds": 10.3634,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 9.67544,
        "pauseEnd": 10.3634,
        "predictedSeconds": 10.357579,
        "predictionCorrectionSeconds": 0.005821
      },
      {
        "offset": 53,
        "seconds": 13.7222,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 13.0617,
        "pauseEnd": 13.7222,
        "predictedSeconds": 13.621263,
        "predictionCorrectionSeconds": 0.100937
      },
      {
        "offset": 61,
        "seconds": 16.5219,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 15.5639,
        "pauseEnd": 16.5219,
        "predictedSeconds": 15.764211,
        "predictionCorrectionSeconds": 0.757689
      },
      {
        "offset": 73,
        "seconds": 19.4793,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 18.9169,
        "pauseEnd": 19.4793,
        "predictedSeconds": 18.781579,
        "predictionCorrectionSeconds": 0.697721
      },
      {
        "offset": 80,
        "seconds": 21.0996,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 20.6199,
        "pauseEnd": 21.0996,
        "predictedSeconds": 20.826,
        "predictionCorrectionSeconds": 0.2736
      },
      {
        "offset": 85,
        "seconds": 22.5501,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 22.1058,
        "pauseEnd": 22.5501,
        "predictedSeconds": 21.959053,
        "predictionCorrectionSeconds": 0.591047
      },
      {
        "offset": 99,
        "seconds": 24.7112,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 24.3663,
        "pauseEnd": 24.7112,
        "predictedSeconds": 25.469053,
        "predictionCorrectionSeconds": -0.757853
      },
      {
        "offset": 114,
        "seconds": 29.484,
        "source": "clip-end"
      }
    ],
    "quality": {
      "punctuationBoundaries": 10,
      "detectedPauses": 16,
      "matchedPauses": 10,
      "meanPredictionCorrectionSeconds": 0.36623,
      "maxPredictionCorrectionSeconds": 0.757853,
      "maxUnanchoredSeconds": 4.7728
    },
    "detectedSilences": [
      {
        "start": 0,
        "end": 0.162688,
        "duration": 0.162688
      },
      {
        "start": 1.75681,
        "end": 2.3925,
        "duration": 0.63569
      },
      {
        "start": 3.67266,
        "end": 4.22297,
        "duration": 0.55031
      },
      {
        "start": 5.97716,
        "end": 6.35972,
        "duration": 0.38256
      },
      {
        "start": 7.44428,
        "end": 8.34284,
        "duration": 0.89856
      },
      {
        "start": 9.67544,
        "end": 10.3634,
        "duration": 0.68796
      },
      {
        "start": 11.1413,
        "end": 11.3463,
        "duration": 0.205
      },
      {
        "start": 13.0617,
        "end": 13.7222,
        "duration": 0.6605
      },
      {
        "start": 14.6036,
        "end": 14.8289,
        "duration": 0.2253
      },
      {
        "start": 15.5639,
        "end": 16.5219,
        "duration": 0.958
      },
      {
        "start": 17.4477,
        "end": 17.7743,
        "duration": 0.3266
      },
      {
        "start": 18.9169,
        "end": 19.4793,
        "duration": 0.5624
      },
      {
        "start": 20.6199,
        "end": 21.0996,
        "duration": 0.4797
      },
      {
        "start": 22.1058,
        "end": 22.5501,
        "duration": 0.4443
      },
      {
        "start": 24.3663,
        "end": 24.7112,
        "duration": 0.3449
      },
      {
        "start": 25.4462,
        "end": 26.3371,
        "duration": 0.8909
      },
      {
        "start": 27.2887,
        "end": 27.508,
        "duration": 0.2193
      },
      {
        "start": 29.2646,
        "end": 29.4675,
        "duration": 0.2029
      }
    ],
    "limitations": "Acoustic pauses are measured, but their association with punctuation is heuristic. Text between matched pauses is interpolated; this is not word-level forced alignment and has no guaranteed word-timing error bound. Browser MP3 padding can introduce a small additional clock offset."
  },
  "env-vents-life": {
    "method": "silence-assisted-text-estimate/v1",
    "text": "热液之境展示了一种没有阳光也能获得食物的方式：某些微生物利用化学反应释放的能量，制造有机物，这叫化能合成。这里的管虫以具有共生细菌的热液管虫为例，细菌在体内提供养分。管虫不是直接吃黑烟或热量；这种供食方式只解释本片的热液群落，不能代表所有深海生命。",
    "duration": 31.464,
    "audioSha256": "f3edefc8690a520c727743301102f59b94fec980fab5c2b770f993c66c5c1a59",
    "textSha256": "732a6a8f6fec5faf6cc8dc3d91d6573661d444d211c8af061aa484186e85de6e",
    "anchors": [
      {
        "offset": 0,
        "seconds": 0,
        "source": "clip-start"
      },
      {
        "offset": 23,
        "seconds": 6.2525,
        "source": "detected-pause-end",
        "punctuation": "：",
        "pauseStart": 5.39556,
        "pauseEnd": 6.2525,
        "predictedSeconds": 5.633716,
        "predictionCorrectionSeconds": 0.618784
      },
      {
        "offset": 40,
        "seconds": 10.1677,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 9.70141,
        "pauseEnd": 10.1677,
        "predictedSeconds": 9.81357,
        "predictionCorrectionSeconds": 0.35413
      },
      {
        "offset": 46,
        "seconds": 11.9247,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 11.1309,
        "pauseEnd": 11.9247,
        "predictedSeconds": 11.328009,
        "predictionCorrectionSeconds": 0.596691
      },
      {
        "offset": 53,
        "seconds": 12.6658,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 12.3691,
        "pauseEnd": 12.6658,
        "predictedSeconds": 13.339185,
        "predictionCorrectionSeconds": -0.673385
      },
      {
        "offset": 73,
        "seconds": 18.9987,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 18.1475,
        "pauseEnd": 18.9987,
        "predictedSeconds": 18.24597,
        "predictionCorrectionSeconds": 0.75273
      },
      {
        "offset": 83,
        "seconds": 21.4374,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 20.9909,
        "pauseEnd": 21.4374,
        "predictedSeconds": 20.984077,
        "predictionCorrectionSeconds": 0.453323
      },
      {
        "offset": 96,
        "seconds": 25.2585,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 24.2562,
        "pauseEnd": 25.2585,
        "predictedSeconds": 24.303729,
        "predictionCorrectionSeconds": 0.954771
      },
      {
        "offset": 113,
        "seconds": 29.4838,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 28.6727,
        "pauseEnd": 29.4838,
        "predictedSeconds": 28.483583,
        "predictionCorrectionSeconds": 1.000217
      },
      {
        "offset": 124,
        "seconds": 31.464,
        "source": "clip-end"
      }
    ],
    "quality": {
      "punctuationBoundaries": 8,
      "detectedPauses": 15,
      "matchedPauses": 8,
      "meanPredictionCorrectionSeconds": 0.675504,
      "maxPredictionCorrectionSeconds": 1.000217,
      "maxUnanchoredSeconds": 6.3329
    },
    "detectedSilences": [
      {
        "start": 0,
        "end": 0.173625,
        "duration": 0.173625
      },
      {
        "start": 1.12659,
        "end": 1.54438,
        "duration": 0.41779
      },
      {
        "start": 2.50416,
        "end": 2.77981,
        "duration": 0.27565
      },
      {
        "start": 5.39556,
        "end": 6.2525,
        "duration": 0.85694
      },
      {
        "start": 7.30719,
        "end": 7.57759,
        "duration": 0.2704
      },
      {
        "start": 9.70141,
        "end": 10.1677,
        "duration": 0.46629
      },
      {
        "start": 11.1309,
        "end": 11.9247,
        "duration": 0.7938
      },
      {
        "start": 12.3691,
        "end": 12.6658,
        "duration": 0.2967
      },
      {
        "start": 13.6774,
        "end": 14.0955,
        "duration": 0.4181
      },
      {
        "start": 15.0817,
        "end": 15.6048,
        "duration": 0.5231
      },
      {
        "start": 18.1475,
        "end": 18.9987,
        "duration": 0.8512
      },
      {
        "start": 20.9909,
        "end": 21.4374,
        "duration": 0.4465
      },
      {
        "start": 22.1038,
        "end": 22.3354,
        "duration": 0.2316
      },
      {
        "start": 24.2562,
        "end": 25.2585,
        "duration": 1.0023
      },
      {
        "start": 26.3952,
        "end": 26.7392,
        "duration": 0.344
      },
      {
        "start": 28.6727,
        "end": 29.4838,
        "duration": 0.8111
      },
      {
        "start": 31.0885,
        "end": 31.4475,
        "duration": 0.359
      }
    ],
    "limitations": "Acoustic pauses are measured, but their association with punctuation is heuristic. Text between matched pauses is interpolated; this is not word-level forced alignment and has no guaranteed word-timing error bound. Browser MP3 padding can introduce a small additional clock offset."
  },
  "env-vents-investigation": {
    "method": "silence-assisted-text-estimate/v1",
    "text": "在热液之境，我们想调查热液怎样影响周围水体。照片记录烟囱、羽流和管虫的位置，水样留给后续检测；两者回答的问题不同。喷口外缘和远处背景站都采水，保留编号、深度、时刻与方法，才能比较同一指标。还要重复采样、检查其他条件；本片的模型和示例读数不会产生新的实测结论。",
    "duration": 31.824,
    "audioSha256": "153396c423b0374e681f6c89881441ecae3ab426b7204d233514d79866d52a3d",
    "textSha256": "d6f398d37a0cf8e6a46884e66da074aee609b5d89b7e6b5b0bb5a24ea3b9ea76",
    "anchors": [
      {
        "offset": 0,
        "seconds": 0,
        "source": "clip-start"
      },
      {
        "offset": 6,
        "seconds": 1.80609,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 1.20944,
        "pauseEnd": 1.80609,
        "predictedSeconds": 1.473333,
        "predictionCorrectionSeconds": 0.332757
      },
      {
        "offset": 22,
        "seconds": 5.24878,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 4.68525,
        "pauseEnd": 5.24878,
        "predictedSeconds": 5.55152,
        "predictionCorrectionSeconds": -0.30274
      },
      {
        "offset": 29,
        "seconds": 6.94256,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 6.46684,
        "pauseEnd": 6.94256,
        "predictedSeconds": 7.10736,
        "predictionCorrectionSeconds": -0.1648
      },
      {
        "offset": 38,
        "seconds": 9.48572,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 8.80953,
        "pauseEnd": 9.48572,
        "predictedSeconds": 9.287893,
        "predictionCorrectionSeconds": 0.197827
      },
      {
        "offset": 47,
        "seconds": 12.0914,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 11.449,
        "pauseEnd": 12.0914,
        "predictedSeconds": 11.574507,
        "predictionCorrectionSeconds": 0.516893
      },
      {
        "offset": 57,
        "seconds": 14.0856,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 13.6896,
        "pauseEnd": 14.0856,
        "predictedSeconds": 14.238293,
        "predictionCorrectionSeconds": -0.152693
      },
      {
        "offset": 71,
        "seconds": 17.735,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 17.0532,
        "pauseEnd": 17.735,
        "predictedSeconds": 17.597493,
        "predictionCorrectionSeconds": 0.137507
      },
      {
        "offset": 76,
        "seconds": 18.9054,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 18.5832,
        "pauseEnd": 18.9054,
        "predictedSeconds": 18.681867,
        "predictionCorrectionSeconds": 0.223533
      },
      {
        "offset": 79,
        "seconds": 19.8981,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 19.4913,
        "pauseEnd": 19.8981,
        "predictedSeconds": 19.294773,
        "predictionCorrectionSeconds": 0.603327
      },
      {
        "offset": 85,
        "seconds": 20.8431,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 20.5628,
        "pauseEnd": 20.8431,
        "predictedSeconds": 20.768107,
        "predictionCorrectionSeconds": 0.074993
      },
      {
        "offset": 94,
        "seconds": 23.8723,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 23.5311,
        "pauseEnd": 23.8723,
        "predictedSeconds": 23.19616,
        "predictionCorrectionSeconds": 0.67614
      },
      {
        "offset": 101,
        "seconds": 25.4898,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 25.002,
        "pauseEnd": 25.4898,
        "predictedSeconds": 24.752,
        "predictionCorrectionSeconds": 0.7378
      },
      {
        "offset": 108,
        "seconds": 27.4064,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 26.6209,
        "pauseEnd": 27.4064,
        "predictedSeconds": 26.567147,
        "predictionCorrectionSeconds": 0.839253
      },
      {
        "offset": 129,
        "seconds": 31.824,
        "source": "clip-end"
      }
    ],
    "quality": {
      "punctuationBoundaries": 13,
      "detectedPauses": 16,
      "matchedPauses": 13,
      "meanPredictionCorrectionSeconds": 0.381559,
      "maxPredictionCorrectionSeconds": 0.839253,
      "maxUnanchoredSeconds": 4.4176
    },
    "detectedSilences": [
      {
        "start": 0,
        "end": 0.177719,
        "duration": 0.177719
      },
      {
        "start": 1.20944,
        "end": 1.80609,
        "duration": 0.59665
      },
      {
        "start": 4.68525,
        "end": 5.24878,
        "duration": 0.56353
      },
      {
        "start": 6.46684,
        "end": 6.94256,
        "duration": 0.47572
      },
      {
        "start": 7.47022,
        "end": 7.77056,
        "duration": 0.30034
      },
      {
        "start": 8.80953,
        "end": 9.48572,
        "duration": 0.67619
      },
      {
        "start": 10.129,
        "end": 10.2656,
        "duration": 0.1366
      },
      {
        "start": 11.449,
        "end": 12.0914,
        "duration": 0.6424
      },
      {
        "start": 13.6896,
        "end": 14.0856,
        "duration": 0.396
      },
      {
        "start": 17.0532,
        "end": 17.735,
        "duration": 0.6818
      },
      {
        "start": 18.5832,
        "end": 18.9054,
        "duration": 0.3222
      },
      {
        "start": 19.4913,
        "end": 19.8981,
        "duration": 0.4068
      },
      {
        "start": 20.5628,
        "end": 20.8431,
        "duration": 0.2803
      },
      {
        "start": 21.5028,
        "end": 22.0098,
        "duration": 0.507
      },
      {
        "start": 23.5311,
        "end": 23.8723,
        "duration": 0.3412
      },
      {
        "start": 25.002,
        "end": 25.4898,
        "duration": 0.4878
      },
      {
        "start": 26.6209,
        "end": 27.4064,
        "duration": 0.7855
      },
      {
        "start": 29.3337,
        "end": 29.8039,
        "duration": 0.4702
      },
      {
        "start": 31.4625,
        "end": 31.8075,
        "duration": 0.345
      }
    ],
    "limitations": "Acoustic pauses are measured, but their association with punctuation is heuristic. Text between matched pauses is interpolated; this is not word-level forced alignment and has no guaranteed word-timing error bound. Browser MP3 padding can introduce a small additional clock offset."
  },
  "env-canyon-overview": {
    "method": "silence-assisted-text-estimate/v1",
    "text": "你现在来到峡谷回声，不是热液之境的海洋裂缝区。这是一条设定在约两千五百到三千米水深的虚构深海峡谷，主要看高岩壁、台面和弯曲谷底，以及它们怎样影响水流、泥沙和生命分布。地形不是实测海域，纵向也经过压缩；模型坐标和机位高度，不能直接当成真实水深。",
    "duration": 30.6,
    "audioSha256": "f9b68d120fda44cd563896d74423ad54b3ef26d8154abd9f3cdbe32238172b6b",
    "textSha256": "aa4a88f29ada7eafc5592e340976c67671d1bb112d4453b367f8b72144dd3d51",
    "anchors": [
      {
        "offset": 0,
        "seconds": 0,
        "source": "clip-start"
      },
      {
        "offset": 10,
        "seconds": 2.77638,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 1.94059,
        "pauseEnd": 2.77638,
        "predictedSeconds": 2.488298,
        "predictionCorrectionSeconds": 0.288082
      },
      {
        "offset": 23,
        "seconds": 5.45925,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 4.85916,
        "pauseEnd": 5.45925,
        "predictedSeconds": 5.959778,
        "predictionCorrectionSeconds": -0.500528
      },
      {
        "offset": 49,
        "seconds": 11.7517,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 11.1011,
        "pauseEnd": 11.7517,
        "predictedSeconds": 12.332249,
        "predictionCorrectionSeconds": -0.580549
      },
      {
        "offset": 56,
        "seconds": 14.3493,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 14.0327,
        "pauseEnd": 14.3493,
        "predictedSeconds": 13.93447,
        "predictionCorrectionSeconds": 0.41483
      },
      {
        "offset": 64,
        "seconds": 16.0645,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 15.2903,
        "pauseEnd": 16.0645,
        "predictedSeconds": 15.937247,
        "predictionCorrectionSeconds": 0.127253
      },
      {
        "offset": 75,
        "seconds": 18.3969,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 18.0613,
        "pauseEnd": 18.3969,
        "predictedSeconds": 18.510512,
        "predictionCorrectionSeconds": -0.113612
      },
      {
        "offset": 83,
        "seconds": 20.559,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 20.0376,
        "pauseEnd": 20.559,
        "predictedSeconds": 20.768187,
        "predictionCorrectionSeconds": -0.209187
      },
      {
        "offset": 92,
        "seconds": 23.052,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 22.2868,
        "pauseEnd": 23.052,
        "predictedSeconds": 23.013725,
        "predictionCorrectionSeconds": 0.038275
      },
      {
        "offset": 100,
        "seconds": 25.9534,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 24.7202,
        "pauseEnd": 25.9534,
        "predictedSeconds": 25.125744,
        "predictionCorrectionSeconds": 0.827656
      },
      {
        "offset": 110,
        "seconds": 28.41,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 27.7913,
        "pauseEnd": 28.41,
        "predictedSeconds": 27.614042,
        "predictionCorrectionSeconds": 0.795958
      },
      {
        "offset": 121,
        "seconds": 30.6,
        "source": "clip-end"
      }
    ],
    "quality": {
      "punctuationBoundaries": 10,
      "detectedPauses": 14,
      "matchedPauses": 10,
      "meanPredictionCorrectionSeconds": 0.389593,
      "maxPredictionCorrectionSeconds": 0.827656,
      "maxUnanchoredSeconds": 6.29245
    },
    "detectedSilences": [
      {
        "start": 0,
        "end": 0.236219,
        "duration": 0.236219
      },
      {
        "start": 1.94059,
        "end": 2.77638,
        "duration": 0.83579
      },
      {
        "start": 4.85916,
        "end": 5.45925,
        "duration": 0.60009
      },
      {
        "start": 8.12909,
        "end": 8.47344,
        "duration": 0.34435
      },
      {
        "start": 11.1011,
        "end": 11.7517,
        "duration": 0.6506
      },
      {
        "start": 13.0883,
        "end": 13.5077,
        "duration": 0.4194
      },
      {
        "start": 14.0327,
        "end": 14.3493,
        "duration": 0.3166
      },
      {
        "start": 15.2903,
        "end": 16.0645,
        "duration": 0.7742
      },
      {
        "start": 18.0613,
        "end": 18.3969,
        "duration": 0.3356
      },
      {
        "start": 18.8764,
        "end": 19.1476,
        "duration": 0.2712
      },
      {
        "start": 20.0376,
        "end": 20.559,
        "duration": 0.5214
      },
      {
        "start": 22.2868,
        "end": 23.052,
        "duration": 0.7652
      },
      {
        "start": 23.6154,
        "end": 23.7989,
        "duration": 0.1835
      },
      {
        "start": 24.7202,
        "end": 25.9534,
        "duration": 1.2332
      },
      {
        "start": 27.7913,
        "end": 28.41,
        "duration": 0.6187
      },
      {
        "start": 30.259,
        "end": 30.5835,
        "duration": 0.3245
      }
    ],
    "limitations": "Acoustic pauses are measured, but their association with punctuation is heuristic. Text between matched pauses is interpolated; this is not word-level forced alignment and has no guaranteed word-timing error bound. Browser MP3 padding can introduce a small additional clock offset."
  },
  "env-canyon-depth": {
    "method": "silence-assisted-text-estimate/v1",
    "text": "在这条模拟深海峡谷里，阳光已经无法照到海床，潜器靠灯光拍摄。深层海水通常寒冷，但并非整个海洋都固定在同一个温度；水压则随深度增加。黑暗和高压不等于没有生命，也不能据此断定没有氧气。你看到的珊瑚和海绵，是用来认识适应深海环境的不同生命形态。",
    "duration": 33.12,
    "audioSha256": "4e7701692fea136784a9063227e96cc5758ad3ce2fdb398ce7447ec9456a8f37",
    "textSha256": "26cc7eeca242af85d73cfb1e2bf78b71ae3bc9f085c579a39f3f93076a9e641c",
    "anchors": [
      {
        "offset": 0,
        "seconds": 0,
        "source": "clip-start"
      },
      {
        "offset": 11,
        "seconds": 3.27569,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 2.41263,
        "pauseEnd": 3.27569,
        "predictedSeconds": 2.953627,
        "predictionCorrectionSeconds": 0.322063
      },
      {
        "offset": 22,
        "seconds": 6.74722,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 5.67372,
        "pauseEnd": 6.74722,
        "predictedSeconds": 5.907253,
        "predictionCorrectionSeconds": 0.839967
      },
      {
        "offset": 30,
        "seconds": 7.7485,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 7.46569,
        "pauseEnd": 7.7485,
        "predictedSeconds": 8.348918,
        "predictionCorrectionSeconds": -0.600418
      },
      {
        "offset": 39,
        "seconds": 10.9329,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 10.6923,
        "pauseEnd": 10.9329,
        "predictedSeconds": 10.777455,
        "predictionCorrectionSeconds": 0.155445
      },
      {
        "offset": 56,
        "seconds": 14.6113,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 14.0719,
        "pauseEnd": 14.6113,
        "predictedSeconds": 15.424495,
        "predictionCorrectionSeconds": -0.813195
      },
      {
        "offset": 65,
        "seconds": 18.2727,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 17.7839,
        "pauseEnd": 18.2727,
        "predictedSeconds": 18.128704,
        "predictionCorrectionSeconds": 0.143996
      },
      {
        "offset": 78,
        "seconds": 21.4929,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 21.055,
        "pauseEnd": 21.4929,
        "predictedSeconds": 21.60742,
        "predictionCorrectionSeconds": -0.11452
      },
      {
        "offset": 90,
        "seconds": 25.0155,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 24.8021,
        "pauseEnd": 25.0155,
        "predictedSeconds": 25.099263,
        "predictionCorrectionSeconds": -0.083763
      },
      {
        "offset": 100,
        "seconds": 28.5654,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 27.8408,
        "pauseEnd": 28.5654,
        "predictedSeconds": 27.790345,
        "predictionCorrectionSeconds": 0.775055
      },
      {
        "offset": 119,
        "seconds": 33.12,
        "source": "clip-end"
      }
    ],
    "quality": {
      "punctuationBoundaries": 9,
      "detectedPauses": 18,
      "matchedPauses": 9,
      "meanPredictionCorrectionSeconds": 0.427602,
      "maxPredictionCorrectionSeconds": 0.839967,
      "maxUnanchoredSeconds": 4.5546
    },
    "detectedSilences": [
      {
        "start": 0,
        "end": 0.226594,
        "duration": 0.226594
      },
      {
        "start": 2.41263,
        "end": 3.27569,
        "duration": 0.86306
      },
      {
        "start": 3.90631,
        "end": 4.17347,
        "duration": 0.26716
      },
      {
        "start": 5.67372,
        "end": 6.74722,
        "duration": 1.0735
      },
      {
        "start": 7.46569,
        "end": 7.7485,
        "duration": 0.28281
      },
      {
        "start": 8.77594,
        "end": 9.707,
        "duration": 0.93106
      },
      {
        "start": 10.6923,
        "end": 10.9329,
        "duration": 0.2406
      },
      {
        "start": 11.7372,
        "end": 12.7389,
        "duration": 1.0017
      },
      {
        "start": 14.0719,
        "end": 14.6113,
        "duration": 0.5394
      },
      {
        "start": 16.1472,
        "end": 17.1273,
        "duration": 0.9801
      },
      {
        "start": 17.7839,
        "end": 18.2727,
        "duration": 0.4888
      },
      {
        "start": 19.4611,
        "end": 20.0109,
        "duration": 0.5498
      },
      {
        "start": 21.055,
        "end": 21.4929,
        "duration": 0.4379
      },
      {
        "start": 22.5833,
        "end": 23.5584,
        "duration": 0.9751
      },
      {
        "start": 24.8021,
        "end": 25.0155,
        "duration": 0.2134
      },
      {
        "start": 25.7408,
        "end": 26.2039,
        "duration": 0.4631
      },
      {
        "start": 27.8408,
        "end": 28.5654,
        "duration": 0.7246
      },
      {
        "start": 29.6288,
        "end": 29.9462,
        "duration": 0.3174
      },
      {
        "start": 30.5086,
        "end": 30.7528,
        "duration": 0.2442
      },
      {
        "start": 32.8746,
        "end": 33.1035,
        "duration": 0.2289
      }
    ],
    "limitations": "Acoustic pauses are measured, but their association with punctuation is heuristic. Text between matched pauses is interpolated; this is not word-level forced alignment and has no guaranteed word-timing error bound. Browser MP3 padding can introduce a small additional clock offset."
  },
  "env-canyon-landforms": {
    "method": "silence-assisted-text-estimate/v1",
    "text": "峡谷回声里，陡壁、岩石台面和低处泥沙，代表不同的海床表面。真实海底的水流能够搬运、重新扬起和沉积泥沙；含沙较多、密度较大的水体还可能在重力作用下沿坡下行，称为浑浊流，这类过程能长期侵蚀和塑造峡谷。但本片只演示地貌关系，不能看着模型就认定某次地震或某一种水流造出了它。",
    "duration": 35.496,
    "audioSha256": "52deff3cf1ab1c1629ba67e0f93ccc13ac310612ac0cba75397be42a4a92eb10",
    "textSha256": "1c31bf93403447fcdd18b6d68343cf68a0062a273fb026d4df1b671c6f4b4f68",
    "anchors": [
      {
        "offset": 0,
        "seconds": 0,
        "source": "clip-start"
      },
      {
        "offset": 6,
        "seconds": 2.16678,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 1.31062,
        "pauseEnd": 2.16678,
        "predictedSeconds": 1.611696,
        "predictionCorrectionSeconds": 0.555084
      },
      {
        "offset": 9,
        "seconds": 3.33688,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 2.68897,
        "pauseEnd": 3.33688,
        "predictedSeconds": 2.282162,
        "predictionCorrectionSeconds": 1.054718
      },
      {
        "offset": 19,
        "seconds": 4.612,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 4.17275,
        "pauseEnd": 4.612,
        "predictedSeconds": 4.925344,
        "predictionCorrectionSeconds": -0.313344
      },
      {
        "offset": 29,
        "seconds": 8.62894,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 8.16959,
        "pauseEnd": 8.62894,
        "predictedSeconds": 7.839291,
        "predictionCorrectionSeconds": 0.789649
      },
      {
        "offset": 41,
        "seconds": 10.3374,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 10.0099,
        "pauseEnd": 10.3374,
        "predictedSeconds": 10.830599,
        "predictionCorrectionSeconds": -0.493199
      },
      {
        "offset": 51,
        "seconds": 12.9121,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 12.5586,
        "pauseEnd": 12.9121,
        "predictedSeconds": 13.589823,
        "predictionCorrectionSeconds": -0.677723
      },
      {
        "offset": 56,
        "seconds": 14.3563,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 13.91,
        "pauseEnd": 14.3563,
        "predictedSeconds": 14.776032,
        "predictionCorrectionSeconds": -0.419732
      },
      {
        "offset": 77,
        "seconds": 20.8767,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 20.3371,
        "pauseEnd": 20.8767,
        "predictedSeconds": 20.255799,
        "predictionCorrectionSeconds": 0.620901
      },
      {
        "offset": 83,
        "seconds": 22.5209,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 21.8991,
        "pauseEnd": 22.5209,
        "predictedSeconds": 21.867496,
        "predictionCorrectionSeconds": 0.653404
      },
      {
        "offset": 98,
        "seconds": 26.6561,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 26.0344,
        "pauseEnd": 26.6561,
        "predictedSeconds": 26.0708,
        "predictionCorrectionSeconds": 0.5853
      },
      {
        "offset": 109,
        "seconds": 27.8324,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 27.4923,
        "pauseEnd": 27.8324,
        "predictedSeconds": 28.971853,
        "predictionCorrectionSeconds": -1.139453
      },
      {
        "offset": 133,
        "seconds": 35.496,
        "source": "clip-end"
      }
    ],
    "quality": {
      "punctuationBoundaries": 11,
      "detectedPauses": 21,
      "matchedPauses": 11,
      "meanPredictionCorrectionSeconds": 0.663864,
      "maxPredictionCorrectionSeconds": 1.139453,
      "maxUnanchoredSeconds": 7.6636
    },
    "detectedSilences": [
      {
        "start": 0,
        "end": 0.169375,
        "duration": 0.169375
      },
      {
        "start": 1.31062,
        "end": 2.16678,
        "duration": 0.85616
      },
      {
        "start": 2.68897,
        "end": 3.33688,
        "duration": 0.64791
      },
      {
        "start": 4.17275,
        "end": 4.612,
        "duration": 0.43925
      },
      {
        "start": 5.67894,
        "end": 6.29353,
        "duration": 0.61459
      },
      {
        "start": 6.78294,
        "end": 6.92803,
        "duration": 0.14509
      },
      {
        "start": 8.16959,
        "end": 8.62894,
        "duration": 0.45935
      },
      {
        "start": 10.0099,
        "end": 10.3374,
        "duration": 0.3275
      },
      {
        "start": 11.0994,
        "end": 11.6264,
        "duration": 0.527
      },
      {
        "start": 12.5586,
        "end": 12.9121,
        "duration": 0.3535
      },
      {
        "start": 13.91,
        "end": 14.3563,
        "duration": 0.4463
      },
      {
        "start": 15.2523,
        "end": 15.8512,
        "duration": 0.5989
      },
      {
        "start": 17.15,
        "end": 17.6314,
        "duration": 0.4814
      },
      {
        "start": 19.1576,
        "end": 19.4665,
        "duration": 0.3089
      },
      {
        "start": 20.3371,
        "end": 20.8767,
        "duration": 0.5396
      },
      {
        "start": 21.8991,
        "end": 22.5209,
        "duration": 0.6218
      },
      {
        "start": 23.3399,
        "end": 23.649,
        "duration": 0.3091
      },
      {
        "start": 24.8523,
        "end": 25.0934,
        "duration": 0.2411
      },
      {
        "start": 26.0344,
        "end": 26.6561,
        "duration": 0.6217
      },
      {
        "start": 27.4923,
        "end": 27.8324,
        "duration": 0.3401
      },
      {
        "start": 29.2346,
        "end": 30.2229,
        "duration": 0.9883
      },
      {
        "start": 31.356,
        "end": 31.7442,
        "duration": 0.3882
      },
      {
        "start": 33.1475,
        "end": 33.4534,
        "duration": 0.3059
      },
      {
        "start": 35.2732,
        "end": 35.4795,
        "duration": 0.2063
      }
    ],
    "limitations": "Acoustic pauses are measured, but their association with punctuation is heuristic. Text between matched pauses is interpolated; this is not word-level forced alignment and has no guaranteed word-timing error bound. Browser MP3 padding can introduce a small additional clock offset."
  },
  "env-canyon-food": {
    "method": "silence-assisted-text-estimate/v1",
    "text": "峡谷回声里的水不是静止背景。水流可以带来悬浮食物，也会把落下的颗粒再次带起；含有表层有机碎屑的颗粒不断下沉，常被称为海洋雪，并不是冰雪。冷水珊瑚和许多海绵能够从流经身边的水中取食。本场景没有设置热液喷口，不应把另一场景的化能合成供食过程套到这里。",
    "duration": 31.212,
    "audioSha256": "0f84697af206832de797473af728503547d4545caf13b1884dc6ee63a97f3867",
    "textSha256": "017190d5bd39ea4f114a80750f78311348f2cbcd439a6b2b72d91f2ef95ae644",
    "anchors": [
      {
        "offset": 0,
        "seconds": 0,
        "source": "clip-start"
      },
      {
        "offset": 14,
        "seconds": 3.63194,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 2.97191,
        "pauseEnd": 3.63194,
        "predictedSeconds": 3.67624,
        "predictionCorrectionSeconds": -0.0443
      },
      {
        "offset": 25,
        "seconds": 6.67616,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 6.09175,
        "pauseEnd": 6.67616,
        "predictedSeconds": 6.379358,
        "predictionCorrectionSeconds": 0.296802
      },
      {
        "offset": 38,
        "seconds": 9.93719,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 9.04372,
        "pauseEnd": 9.93719,
        "predictedSeconds": 9.671155,
        "predictionCorrectionSeconds": 0.266035
      },
      {
        "offset": 54,
        "seconds": 14.0213,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 13.232,
        "pauseEnd": 14.0213,
        "predictedSeconds": 13.575658,
        "predictionCorrectionSeconds": 0.445642
      },
      {
        "offset": 62,
        "seconds": 16.1863,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 15.3255,
        "pauseEnd": 16.1863,
        "predictedSeconds": 15.557945,
        "predictionCorrectionSeconds": 0.628355
      },
      {
        "offset": 68,
        "seconds": 17.5927,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 17.0436,
        "pauseEnd": 17.5927,
        "predictedSeconds": 17.311968,
        "predictionCorrectionSeconds": 0.280732
      },
      {
        "offset": 90,
        "seconds": 23.4093,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 22.8388,
        "pauseEnd": 23.4093,
        "predictedSeconds": 22.910425,
        "predictionCorrectionSeconds": 0.498875
      },
      {
        "offset": 102,
        "seconds": 26.5387,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 25.5812,
        "pauseEnd": 26.5387,
        "predictedSeconds": 25.85382,
        "predictionCorrectionSeconds": 0.68488
      },
      {
        "offset": 123,
        "seconds": 31.212,
        "source": "clip-end"
      }
    ],
    "quality": {
      "punctuationBoundaries": 8,
      "detectedPauses": 16,
      "matchedPauses": 8,
      "meanPredictionCorrectionSeconds": 0.393203,
      "maxPredictionCorrectionSeconds": 0.68488,
      "maxUnanchoredSeconds": 5.8166
    },
    "detectedSilences": [
      {
        "start": 0,
        "end": 0.1635,
        "duration": 0.1635
      },
      {
        "start": 1.55672,
        "end": 1.96663,
        "duration": 0.40991
      },
      {
        "start": 2.97191,
        "end": 3.63194,
        "duration": 0.66003
      },
      {
        "start": 4.3265,
        "end": 4.59053,
        "duration": 0.26403
      },
      {
        "start": 6.09175,
        "end": 6.67616,
        "duration": 0.58441
      },
      {
        "start": 8.00394,
        "end": 8.22247,
        "duration": 0.21853
      },
      {
        "start": 9.04372,
        "end": 9.93719,
        "duration": 0.89347
      },
      {
        "start": 12.1457,
        "end": 12.4642,
        "duration": 0.3185
      },
      {
        "start": 13.232,
        "end": 14.0213,
        "duration": 0.7893
      },
      {
        "start": 15.3255,
        "end": 16.1863,
        "duration": 0.8608
      },
      {
        "start": 17.0436,
        "end": 17.5927,
        "duration": 0.5491
      },
      {
        "start": 18.6077,
        "end": 18.8869,
        "duration": 0.2792
      },
      {
        "start": 19.8625,
        "end": 20.4636,
        "duration": 0.6011
      },
      {
        "start": 22.8388,
        "end": 23.4093,
        "duration": 0.5705
      },
      {
        "start": 25.5812,
        "end": 26.5387,
        "duration": 0.9575
      },
      {
        "start": 28.3796,
        "end": 28.6886,
        "duration": 0.309
      },
      {
        "start": 29.9423,
        "end": 30.2204,
        "duration": 0.2781
      },
      {
        "start": 30.858,
        "end": 31.1955,
        "duration": 0.3375
      }
    ],
    "limitations": "Acoustic pauses are measured, but their association with punctuation is heuristic. Text between matched pauses is interpolated; this is not word-level forced alignment and has no guaranteed word-timing error bound. Browser MP3 padding can introduce a small additional clock offset."
  },
  "env-canyon-habitat": {
    "method": "silence-assisted-text-estimate/v1",
    "text": "在峡谷回声里找生命，先看它附着的表面，再看周围水体。暴露岩面能提供附着位置，泥沙覆盖的谷底则是另一种栖息环境。画面的亮区来自潜器灯光和教学照明，不是阳光照进深谷。珊瑚在某处出现，可能与表面、水流和食物有关；一张模型画面只能提出线索，不能证明分布原因。",
    "duration": 34.128,
    "audioSha256": "5b2657406f4b489c60229180ac01e7d7a01712cc30a551a0c4be086deb024f85",
    "textSha256": "0ee22cd9ccffad3802427ac8be35818b40e52a13b4cd1a6ad460471ad043594a",
    "anchors": [
      {
        "offset": 0,
        "seconds": 0,
        "source": "clip-start"
      },
      {
        "offset": 10,
        "seconds": 2.84366,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 2.07884,
        "pauseEnd": 2.84366,
        "predictedSeconds": 2.650091,
        "predictionCorrectionSeconds": 0.193569
      },
      {
        "offset": 19,
        "seconds": 5.18516,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 4.51169,
        "pauseEnd": 5.18516,
        "predictedSeconds": 5.041636,
        "predictionCorrectionSeconds": 0.143524
      },
      {
        "offset": 26,
        "seconds": 7.30394,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 6.38056,
        "pauseEnd": 7.30394,
        "predictedSeconds": 7.187564,
        "predictionCorrectionSeconds": 0.116376
      },
      {
        "offset": 38,
        "seconds": 10.9467,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 10.0797,
        "pauseEnd": 10.9467,
        "predictedSeconds": 10.354745,
        "predictionCorrectionSeconds": 0.591955
      },
      {
        "offset": 55,
        "seconds": 15.0665,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 14.4475,
        "pauseEnd": 15.0665,
        "predictedSeconds": 15.086127,
        "predictionCorrectionSeconds": -0.019627
      },
      {
        "offset": 72,
        "seconds": 20.2524,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 19.2249,
        "pauseEnd": 20.2524,
        "predictedSeconds": 19.546036,
        "predictionCorrectionSeconds": 0.706364
      },
      {
        "offset": 81,
        "seconds": 22.2841,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 21.8109,
        "pauseEnd": 22.2841,
        "predictedSeconds": 22.209055,
        "predictionCorrectionSeconds": 0.075045
      },
      {
        "offset": 89,
        "seconds": 24.6001,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 23.947,
        "pauseEnd": 24.6001,
        "predictedSeconds": 24.342055,
        "predictionCorrectionSeconds": 0.258045
      },
      {
        "offset": 95,
        "seconds": 25.9898,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 25.7027,
        "pauseEnd": 25.9898,
        "predictedSeconds": 25.789909,
        "predictionCorrectionSeconds": 0.199891
      },
      {
        "offset": 103,
        "seconds": 26.9167,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 26.67,
        "pauseEnd": 26.9167,
        "predictedSeconds": 28.039255,
        "predictionCorrectionSeconds": -1.122555
      },
      {
        "offset": 116,
        "seconds": 30.6093,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 30.2028,
        "pauseEnd": 30.6093,
        "predictedSeconds": 31.464982,
        "predictionCorrectionSeconds": -0.855682
      },
      {
        "offset": 125,
        "seconds": 34.128,
        "source": "clip-end"
      }
    ],
    "quality": {
      "punctuationBoundaries": 11,
      "detectedPauses": 17,
      "matchedPauses": 11,
      "meanPredictionCorrectionSeconds": 0.38933,
      "maxPredictionCorrectionSeconds": 1.122555,
      "maxUnanchoredSeconds": 5.1859
    },
    "detectedSilences": [
      {
        "start": 0,
        "end": 0.231813,
        "duration": 0.231813
      },
      {
        "start": 2.07884,
        "end": 2.84366,
        "duration": 0.76482
      },
      {
        "start": 4.51169,
        "end": 5.18516,
        "duration": 0.67347
      },
      {
        "start": 6.38056,
        "end": 7.30394,
        "duration": 0.92338
      },
      {
        "start": 8.10725,
        "end": 8.64784,
        "duration": 0.54059
      },
      {
        "start": 10.0797,
        "end": 10.9467,
        "duration": 0.867
      },
      {
        "start": 12.4188,
        "end": 12.8526,
        "duration": 0.4338
      },
      {
        "start": 14.4475,
        "end": 15.0665,
        "duration": 0.619
      },
      {
        "start": 16.2215,
        "end": 16.6777,
        "duration": 0.4562
      },
      {
        "start": 17.9073,
        "end": 18.2354,
        "duration": 0.3281
      },
      {
        "start": 19.2249,
        "end": 20.2524,
        "duration": 1.0275
      },
      {
        "start": 21.8109,
        "end": 22.2841,
        "duration": 0.4732
      },
      {
        "start": 23.947,
        "end": 24.6001,
        "duration": 0.6531
      },
      {
        "start": 25.7027,
        "end": 25.9898,
        "duration": 0.2871
      },
      {
        "start": 26.67,
        "end": 26.9167,
        "duration": 0.2467
      },
      {
        "start": 27.8801,
        "end": 29.0028,
        "duration": 1.1227
      },
      {
        "start": 30.2028,
        "end": 30.6093,
        "duration": 0.4065
      },
      {
        "start": 31.8124,
        "end": 32.4277,
        "duration": 0.6153
      },
      {
        "start": 33.8352,
        "end": 34.1115,
        "duration": 0.2763
      }
    ],
    "limitations": "Acoustic pauses are measured, but their association with punctuation is heuristic. Text between matched pauses is interpolated; this is not word-level forced alignment and has no guaranteed word-timing error bound. Browser MP3 padding can introduce a small additional clock offset."
  },
  "env-canyon-investigation": {
    "method": "silence-assisted-text-estimate/v1",
    "text": "在峡谷回声，我们要把群落、海床和水体放在一起调查。照片保留珊瑚、海绵及其附着表面的样子，两处水样则用同一检测方法比较水体指标。取样必须保留位置、深度、时刻和编号，还要考虑两站条件不同。回到船上继续分析和重复观测，才可能检验原因；画面里的模拟读数不是化验结果。",
    "duration": 33.48,
    "audioSha256": "bc0af50064e7f98a774ce7a731bb25bb1ab94f0e78b0f210cb3cbc9f86558374",
    "textSha256": "49a7c7c5918a8813ddadc1f7af7a026019f491112d84902efff1a338fb0aa31b",
    "anchors": [
      {
        "offset": 0,
        "seconds": 0,
        "source": "clip-start"
      },
      {
        "offset": 6,
        "seconds": 1.78481,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 1.34806,
        "pauseEnd": 1.78481,
        "predictedSeconds": 1.558079,
        "predictionCorrectionSeconds": 0.226731
      },
      {
        "offset": 13,
        "seconds": 3.13434,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 2.87438,
        "pauseEnd": 3.13434,
        "predictedSeconds": 3.20341,
        "predictionCorrectionSeconds": -0.06907
      },
      {
        "offset": 25,
        "seconds": 7.08441,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 6.08916,
        "pauseEnd": 7.08441,
        "predictedSeconds": 6.519002,
        "predictionCorrectionSeconds": 0.565408
      },
      {
        "offset": 32,
        "seconds": 8.93063,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 8.69675,
        "pauseEnd": 8.93063,
        "predictedSeconds": 8.164334,
        "predictionCorrectionSeconds": 0.766296
      },
      {
        "offset": 44,
        "seconds": 9.95481,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 9.55484,
        "pauseEnd": 9.95481,
        "predictedSeconds": 11.218168,
        "predictionCorrectionSeconds": -1.263358
      },
      {
        "offset": 63,
        "seconds": 16.9164,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 16.4899,
        "pauseEnd": 16.9164,
        "predictedSeconds": 16.278809,
        "predictionCorrectionSeconds": 0.637591
      },
      {
        "offset": 72,
        "seconds": 17.8054,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 17.5903,
        "pauseEnd": 17.8054,
        "predictedSeconds": 18.422725,
        "predictionCorrectionSeconds": -0.617325
      },
      {
        "offset": 75,
        "seconds": 19.2602,
        "source": "detected-pause-end",
        "punctuation": "、",
        "pauseStart": 18.8725,
        "pauseEnd": 19.2602,
        "predictedSeconds": 19.070886,
        "predictionCorrectionSeconds": 0.189314
      },
      {
        "offset": 81,
        "seconds": 20.2538,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 19.8455,
        "pauseEnd": 20.2538,
        "predictedSeconds": 20.628965,
        "predictionCorrectionSeconds": -0.375165
      },
      {
        "offset": 92,
        "seconds": 24.7401,
        "source": "detected-pause-end",
        "punctuation": "。",
        "pauseStart": 24.2823,
        "pauseEnd": 24.7401,
        "predictedSeconds": 23.695264,
        "predictionCorrectionSeconds": 1.044836
      },
      {
        "offset": 106,
        "seconds": 27.1001,
        "source": "detected-pause-end",
        "punctuation": "，",
        "pauseStart": 26.8957,
        "pauseEnd": 27.1001,
        "predictedSeconds": 27.247684,
        "predictionCorrectionSeconds": -0.147584
      },
      {
        "offset": 114,
        "seconds": 28.5553,
        "source": "detected-pause-end",
        "punctuation": "；",
        "pauseStart": 28.0226,
        "pauseEnd": 28.5553,
        "predictedSeconds": 29.41653,
        "predictionCorrectionSeconds": -0.86123
      },
      {
        "offset": 129,
        "seconds": 33.48,
        "source": "clip-end"
      }
    ],
    "quality": {
      "punctuationBoundaries": 12,
      "detectedPauses": 21,
      "matchedPauses": 12,
      "meanPredictionCorrectionSeconds": 0.563659,
      "maxPredictionCorrectionSeconds": 1.263358,
      "maxUnanchoredSeconds": 6.96159
    },
    "detectedSilences": [
      {
        "start": 0,
        "end": 0.155094,
        "duration": 0.155094
      },
      {
        "start": 1.34806,
        "end": 1.78481,
        "duration": 0.43675
      },
      {
        "start": 2.87438,
        "end": 3.13434,
        "duration": 0.25996
      },
      {
        "start": 3.77522,
        "end": 4.01612,
        "duration": 0.2409
      },
      {
        "start": 4.67941,
        "end": 4.97959,
        "duration": 0.30018
      },
      {
        "start": 6.08916,
        "end": 7.08441,
        "duration": 0.99525
      },
      {
        "start": 8.69675,
        "end": 8.93063,
        "duration": 0.23388
      },
      {
        "start": 9.55484,
        "end": 9.95481,
        "duration": 0.39997
      },
      {
        "start": 11.5922,
        "end": 12.4718,
        "duration": 0.8796
      },
      {
        "start": 13.345,
        "end": 13.6812,
        "duration": 0.3362
      },
      {
        "start": 15.1483,
        "end": 15.4356,
        "duration": 0.2873
      },
      {
        "start": 16.4899,
        "end": 16.9164,
        "duration": 0.4265
      },
      {
        "start": 17.5903,
        "end": 17.8054,
        "duration": 0.2151
      },
      {
        "start": 18.8725,
        "end": 19.2602,
        "duration": 0.3877
      },
      {
        "start": 19.8455,
        "end": 20.2538,
        "duration": 0.4083
      },
      {
        "start": 21.4865,
        "end": 22.3407,
        "duration": 0.8542
      },
      {
        "start": 24.2823,
        "end": 24.7401,
        "duration": 0.4578
      },
      {
        "start": 25.5982,
        "end": 25.9774,
        "duration": 0.3792
      },
      {
        "start": 26.8957,
        "end": 27.1001,
        "duration": 0.2044
      },
      {
        "start": 28.0226,
        "end": 28.5553,
        "duration": 0.5327
      },
      {
        "start": 29.8506,
        "end": 30.5131,
        "duration": 0.6625
      },
      {
        "start": 31.9127,
        "end": 32.2221,
        "duration": 0.3094
      },
      {
        "start": 33.2824,
        "end": 33.4635,
        "duration": 0.1811
      }
    ],
    "limitations": "Acoustic pauses are measured, but their association with punctuation is heuristic. Text between matched pauses is interpolated; this is not word-level forced alignment and has no guaranteed word-timing error bound. Browser MP3 padding can introduce a small additional clock offset."
  }
});
