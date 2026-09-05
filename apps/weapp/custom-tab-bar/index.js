Component({
  data: {
    selected: 'pages/home/index'
  },

  lifetimes: {
    attached() {
      this.syncSelected();
    }
  },

  pageLifetimes: {
    show() {
      this.syncSelected();
    }
  },

  methods: {
    syncSelected() {
      try {
        const pages = getCurrentPages();
        const current = pages && pages[pages.length - 1];
        if (current && (current.route === 'pages/home/index' || current.route === 'pages/my/index')) {
          this.setData({ selected: current.route });
        }
      } catch (_error) {
        // The component can be created before a page stack is available.
      }
    },

    onTabTap(event) {
      const path = event.currentTarget.dataset.path;
      if (!path || path === this.data.selected) {
        return;
      }
      wx.switchTab({ url: `/${path}` });
    }
  }
});
