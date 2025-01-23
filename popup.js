const app = Vue.createApp({
  data() {
    return {
      configs: [],
      currentDomain: "",
      loading: false,
      message: null,
      vueInfo: {},
    };
  },
  computed: {
    vueVersion() {
      return this.vueInfo.version;
    },
    isVue3() {
      return this.vueVersion >= '3.0';
    },
    isVueProject() {
      return this.vueVersion > '0';
    },
  },
  watch: {
    // Watch configs array for changes
    configs: {
      handler: async function (newConfigs) {
        if (this.isVue3 && Array.isArray(newConfigs)) {
          try {
            await chrome.storage.local.set({
              vueConfigs: JSON.parse(JSON.stringify(newConfigs)),
            });
          } catch (error) {
            console.error("Failed to save configs:", error);
          }
        }
      },
      deep: true, // Watch nested changes in configs array
    },
  },
  async created() {
    try {
      // Get current tab info
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      this.currentDomain = new URL(tab.url).hostname;

      // Get Vue version info
      const vueInfo = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "GET_VUE_VERSION",
            tabId: tab.id,
          },
          resolve
        );
      });

      this.vueInfo = vueInfo || {};
    } catch (error) {
      console.error("Initialization failed:", error);
      this.configs = [];
    }
  },
  methods: {
    addNewRow() {
      if (!this.isVue3) return;
      if (!Array.isArray(this.configs)) {
        this.configs = [];
      }
      this.configs.push({ url: this.currentDomain, selector: "#app" });
    },
    removeRow(index) {
      if (!this.isVue3) return;
      if (Array.isArray(this.configs)) {
        this.configs.splice(index, 1);
        if (this.configs.length === 0) {
          this.configs.push({ url: this.currentDomain, selector: "#app" });
        }
      }
    },
    async enableDevTools() {
      try {
        this.loading = true;
        this.message = null;

        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          await chrome.tabs.sendMessage(tab.id, {
          type: "ENABLE_VUE_DEVTOOLS",
          vueInfo: this.vueInfo,
          tabId: tab.id,
        });

        // Close popup after successful execution
        window.close();
      } catch (error) {
        this.message = {
          type: "error",
          text: "Execution failed: " + error.message,
        };
      } finally {
        this.loading = false;
      }
    },
  },
  render() {
    const h = Vue.h;

    const vueVersion = h(
      "h1",
      { class: "text-sm font-bold mb-2" },
      `Vue Version: ${this.vueVersion || ''}`
    );

    // Enable button
    const enableButton = h(
      "button",
      {
        class: [
          "w-full py-2 bg-green-500 text-white rounded hover:bg-green-600",
          "disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center",
        ],
        disabled: this.loading,
        onClick: this.enableDevTools,
      },
      [
        this.loading
          ? h(
              "svg",
              {
                class: "spin w-5 h-5 mr-2",
                viewBox: "0 0 24 24",
              },
              [
                h("circle", {
                  class: "opacity-25",
                  cx: "12",
                  cy: "12",
                  r: "10",
                  stroke: "currentColor",
                  "stroke-width": "4",
                  fill: "none",
                }),
                h("path", {
                  class: "opacity-75",
                  fill: "currentColor",
                  d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z",
                }),
              ]
            )
          : null,
        this.loading ? "Enabling..." : "Enable Vue DevTools",
      ]
    );

    return h("div", { class: "container mx-auto" }, [
      this.isVueProject
        ? h("div", {}, [
            vueVersion,
            enableButton,
          ])
        : h(
            "div",
            { class: "text-center text-sm font-bold" },
            "not vue project"
          ),
    ]);
  },
});

app.mount("#app");
