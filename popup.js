const app = Vue.createApp({
  data() {
    return {
      configs: [],
      currentDomain: "",
      loading: false,
      message: null,
      vueVersion: 0,
    };
  },
  computed: {
    isVue3() {
      return this.vueVersion === 3;
    },
    isVueProject() {
      return this.vueVersion > 0;
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

      this.vueVersion = vueInfo.version;

      // Only load config for Vue3 projects
      if (this.isVue3) {
        const result = await chrome.storage.local.get("vueConfigs");
        const initConfig = [
          {
            url: this.currentDomain,
            selector: "#app",
          },
        ];
        if (!result) {
          this.configs = initConfig;
          return;
        }
        try {
          const resultCopy = JSON.parse(
            JSON.stringify(result.vueConfigs || "[]")
          );
          this.configs = Array.isArray(resultCopy) ? resultCopy : initConfig;
        } catch (error) {
          console.error("Failed to parse configs:", error);
          this.configs = initConfig;
        }
      }
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

        if (this.isVue3) {
          const configsToSave = Array.isArray(this.configs)
            ? this.configs
            : [
                {
                  url: this.currentDomain,
                  selector: "#app",
                },
              ];

          // Send message to content script
          const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          await chrome.tabs.sendMessage(tab.id, {
            type: "ENABLE_VUE_DEVTOOLS",
            // Find config matching current domain
            config: configsToSave.find((config) =>
              this.currentDomain.startsWith(config.url)
            ),
          });
        } else {
          // Enable directly for Vue2 projects
          const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
          });
          await chrome.tabs.sendMessage(tab.id, {
            type: "ENABLE_VUE_DEVTOOLS",
          });
        }

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
      "h2",
      { class: "text-lg font-bold mb-2" },
      `Vue Version: Vue ${this.isVue3 ? 3 : 2}`
    );

    // Only show config table for Vue3 projects
    const configTable = h("div", { class: "mb-4" }, [
      h("div", { class: "flex justify-end items-center mb-2" }, [
        h(
          "button",
          {
            class: "px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600",
            onClick: this.addNewRow,
          },
          "Add Config"
        ),
      ]),
      h("table", { class: "w-full border-collapse border" }, [
        h("thead", {}, [
          h("tr", {}, [
            h("th", { class: "border p-2" }, "Website URL"),
            h("th", { class: "border p-2" }, "Vue Container Selector"),
            h("th", { class: "border p-2" }, "Action"),
          ]),
        ]),
        h(
          "tbody",
          {},
          Array.isArray(this.configs)
            ? this.configs.map((config, index) => {
                return h("tr", { class: "border" }, [
                  h("td", { class: "border p-2" }, [
                    h("input", {
                      class: "w-full p-1 border rounded",
                      value: config.url,
                      placeholder: this.currentDomain,
                      onInput: (e) => {
                        config.url = e.target.value;
                      },
                    }),
                  ]),
                  h("td", { class: "border p-2" }, [
                    h("input", {
                      class: "w-full p-1 border rounded",
                      value: config.selector,
                      placeholder: "#app",
                      onInput: (e) => {
                        config.selector = e.target.value;
                      },
                    }),
                  ]),
                  h("td", { class: "border p-2" }, [
                    h(
                      "button",
                      {
                        class: [
                          this.configs.length > 1
                            ? ""
                            : "opacity-50 cursor-not-allowed",
                          "px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600",
                        ],
                        onClick: () => this.removeRow(index),
                      },
                      "Delete"
                    ),
                  ]),
                ]);
              })
            : []
        ),
      ]),
    ]);

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
        ? h("div", { class: "mb-4" }, [
            vueVersion,
            this.isVue3 ? configTable : null,
            enableButton,
          ])
        : h(
            "div",
            { class: "text-center text-lg font-bold" },
            "This is not a Vue project"
          ),
    ]);
  },
});

app.mount("#app");
