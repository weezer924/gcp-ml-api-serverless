import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as speech from '@google-cloud/speech';
import * as vision from '@google-cloud/vision';
const requestP = require('request-promise');

admin.initializeApp(functions.config().firebase);

// 音声認識
export const speechToTextFunc = functions.https.onRequest((request, response) => {
  const param: string = request.query.fileName;
  if(!param) {
    console.error('ERROR: fileName is null.');
    response.send(400).end();
  }

  // 音声ファイルの設定
  const payload = {
    config: {
      // WAV, 44100
      encoding: 'AMR',
      sampleRateHertz: 8000,
      languageCode: 'ja-JP'
    },
    audio: {
      uri: '[STORAGE_NAME]' + param
    }
  }

  // SPEECH API
  const speechClient = new speech.SpeechClient();
  speechClient.longRunningRecognize(payload).then(data => {
    const res = data[0];
    console.log('Res is promise');
    return res.promise();
  }).then(data => {
    const res = data[0];
    const transcription = res.results.map(result => result.alternatives[0].transcript).join('\n');
    console.log('Trascription finished! Try to write DB');

    const ref = admin.firestore().collection('orgText').doc(param)
    .set({name: param, text: transcription})
    .then(_ => {
      console.log('Document successfully written!');

      let tags: string[] = [];
      admin.firestore().collection('tags').get().then(snapShot => {
        // 現時点のタグを全取得
        snapShot.forEach(doc => {
          tags = tags.concat(doc.data()[doc.id]);
        });

        // テキストの内容が含めたタグを選別
        const tagsMap: Object = {};
        tags.forEach(tagOne => {
          if(transcription.includes(tagOne)) { // HELP: 検索方法をパフォーマンスアップしたい
            tagsMap[tagOne] = true;
          }
        });

        // タグDBに生成
        admin.firestore().collection('orgText').doc(param)
        .update({tags: tagsMap})
        .then(() => response.send(200).end())
        .catch(error => console.error(error));

      }).catch(error => console.error());
    });
  }).catch(err => {
    console.error('ERROR:', err);
    response.send(err).end();
  });
});

// 画像認識
// Speech APIで音声ファイルを返すのもあり
export const imageVisionFunc = functions.storage.bucket('[BUCKET_NAME]').object().onFinalize(async event => {
  if(!event.name.includes('photos')) {
    return new Promise((resolve, reject) => {
      reject('Not upload to photos');
    });
  }

  const filePath = event.name;

  // 画像のURIを設定
  const imageUri = `[IMAGE_URI]/${filePath}`;

  // vision Apiクライアントを使って、ラベル付け
  const visionClient = new vision.ImageAnnotatorClient();
  const results = await visionClient.labelDetection(imageUri);

  // 結果をラベルに格納する
  const labels = results[0].labelAnnotations.map(obj => obj.description);

  // Firestore (DB)のドキュメントの参照
  const docId = filePath.replace('photos/','');
  const docRef = admin.firestore().collection('photos').doc(docId);

  // 英語のままでDB書き込む
  // return docRef.set({labels, imageUri});

  const promises = [];
  // 英語 -> 日本語テキスト変換
  promises.push(createTranslationPromise(labels, imageUri, docRef))
  return Promise.all(promises);
});

function createTranslationPromise(text, imageUri, docRef) {
  let label: string;
  return requestP(createTranslateUrl('ja', text), {resolveWithFullResponse: true}).then(response => {
    if (response.statusCode === 200) {
      const resData = JSON.parse(response.body).data;

      label = resData.translations[0].translatedText;

      const labels = label.split('、');
      return docRef.set({labels, imageUri});
    }
    else throw response.body;
  });
}

function createTranslateUrl(lang, text) {
  const apiKey = '[API KEY]'
  return `https://www.googleapis.com/language/translate/v2?key=${apiKey}&source=en&target=${lang}&q=${text}`;
}