(function () {
  'use strict';
  function fit() {
    var scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    document.documentElement.style.setProperty('--page-scale', String(scale));
  }
  fit();
  window.addEventListener('resize', fit);
  var params = new URLSearchParams(location.search);
  var number = Number(params.get('page')), total = Number(params.get('total'));
  if (Number.isInteger(number) && number > 0 && number <= total && total <= 100) {
    var label = document.querySelector('.pageno');
    if (label) label.textContent = String(number).padStart(2, '0') + ' / ' + String(total).padStart(2, '0');
  }
  var result;
  function notify() {
    if (parent !== window && result) parent.postMessage(result, '*');
  }
  window.addEventListener('message', function (event) {
    if (event.source === parent && event.data && event.data.type === 'welink-page-check') notify();
  });
  window.__pageReady = Promise.all([document.fonts.ready].concat(Array.from(document.images, function (img) {
    img.loading = 'eager';
    if (img.complete) return img.naturalWidth ? Promise.resolve() : Promise.reject(new Error('图片无法加载：' + img.getAttribute('src')));
    return new Promise(function (resolve, reject) {
      img.addEventListener('load', resolve, {once:true});
      img.addEventListener('error', function () { reject(new Error('图片无法加载：' + img.getAttribute('src'))); }, {once:true});
    });
  }))).then(function () {
    result = {type:'welink-page-ready', ok:true};
    notify();
  }, function (error) {
    result = {type:'welink-page-ready', ok:false, error:error.message};
    notify();
    throw error;
  });
  window.__pageReady.catch(function () {});
})();
