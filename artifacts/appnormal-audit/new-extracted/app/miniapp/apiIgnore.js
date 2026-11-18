/* eslint-disable */
// API屏蔽
qq.createAppBox = function () {
  return {
    load: function () {
      console.info('[qq.createAppBox]', arguments.callee.name, 'empyt function');
      return Promise.reject('方法为空');
    },
    show: function () {
      console.info('[qq.createAppBox]', arguments.callee.name, 'empyt function');
      return Promise.reject('方法为空');
    },
    destroy: function () {
      console.info('[qq.createAppBox]', arguments.callee.name, 'empyt function');
      return Promise.reject('方法为空');
    },
    onClose: function () {
      console.info('[qq.createAppBox]', arguments.callee.name, 'empyt function');
    },
    offClose: function () {
      console.info('[qq.createAppBox]', arguments.callee.name, 'empyt function');
    },
  };
};
qq.createBannerAd = function () {
  return {
    show: function () {
      console.info('[qq.createBannerAd]', arguments.callee.name, 'empyt function');
      return Promise.reject('方法为空');
    },
    hide: function () {
      console.info('[qq.createBannerAd]', arguments.callee.name, 'empyt function');
    },
    destroy: function () {
      console.info('[qq.createBannerAd]', arguments.callee.name, 'empyt function');
    },
    onResize: function () {
      console.info('[qq.createBannerAd]', arguments.callee.name, 'empyt function');
    },
    offResize: function () {
      console.info('[qq.createBannerAd]', arguments.callee.name, 'empyt function');
    },
    onLoad: function () {
      console.info('[qq.createBannerAd]', arguments.callee.name, 'empyt function');
    },
    offLoad: function () {
      console.info('[qq.createBannerAd]', arguments.callee.name, 'empyt function');
    },
    onRefresh: function () {
      console.info('[qq.createBannerAd]', arguments.callee.name, 'empyt function');
    },
    offRefresh: function () {
      console.info('[qq.createBannerAd]', arguments.callee.name, 'empyt function');
    },
    onError: function () {
      console.info('[qq.createBannerAd]', arguments.callee.name, 'empyt function');
    },
    offError: function () {
      console.info('[qq.createBannerAd]', arguments.callee.name, 'empyt function');
    },
  };
};
qq.createInterstitialAd = function () {
  return {
    load: function () {
      console.info('[qq.createInterstitialAd]', arguments.callee.name, 'empyt function');
      return Promise.reject('方法为空');
    },
    show: function () {
      console.info('[qq.createInterstitialAd]', arguments.callee.name, 'empyt function');
      return Promise.reject('方法为空');
    },
    destroy: function () {
      console.info('[qq.createInterstitialAd]', arguments.callee.name, 'empyt function');
      return Promise.reject('方法为空');
    },
    onClose: function () {
      console.info('[qq.createInterstitialAd]', arguments.callee.name, 'empyt function');
    },
    offClose: function () {
      console.info('[qq.createInterstitialAd]', arguments.callee.name, 'empyt function');
    },
    onLoad: function () {
      console.info('[qq.createInterstitialAd]', arguments.callee.name, 'empyt function');
    },
    offLoad: function () {
      console.info('[qq.createInterstitialAd]', arguments.callee.name, 'empyt function');
    },
    onError: function () {
      console.info('[qq.createInterstitialAd]', arguments.callee.name, 'empyt function');
    },
    offError: function () {
      console.info('[qq.createInterstitialAd]', arguments.callee.name, 'empyt function');
    },
  };
};

// PC端无需实现/暂不支持的api
qq.onKeyboardHeightChange = function () {
  console.info('[qq.onKeyboardHeightChange]', arguments.callee.name, 'empyt function');
};

qq.offKeyboardHeightChange = function () {
  console.info('[qq.offKeyboardHeightChange]', arguments.callee.name, 'empyt function');
};

qq.enterContact = function () {
  console.info('[qq.enterContact]', arguments.callee.name, 'empyt function');
};
