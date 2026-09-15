(function () {
  var ns = $.namespace("pskl.controller.settings");
  var HISTORY_KEY = "piskel.console.history.v2";
  var MAX_HISTORY = 50;
  var MAX_HISTORY_ENTRY_LENGTH = 20000;
  var MAX_OUTPUT_ENTRIES = 100;
  var MAX_VISIBLE_OUTPUT_LENGTH = 250000;
  var PSEUDO_COMMANDS = [
    {
      command: "help",
      args: "{filter?}",
      description: "List API commands, optionally filtered by group."
    },
    {
      command: "batch",
      args: "[{command,args?}, ...]",
      description: "Run a JSON array of commands sequentially."
    },
    {
      command: "capabilities",
      args: "{}",
      description: "Read API groups, formats, events and safety limits."
    },
    {
      command: "whenIdle",
      args: "{}",
      description: "Wait for the API queue and return current app state."
    },
    {
      command: "waitForChange",
      args: "{since?,type?,timeout?}",
      description: "Wait for the next matching public API change event."
    }
  ];

  ns.ConsoleController = function () {
    this.api = null;
    this.help = [];
    this.helpByCommand = Object.create(null);
    this.history = [];
    this.historyIndex = 0;
    this.latestOutput = null;
    this.changeUnsubscribe = null;
    this.running = false;
    this.destroyed = false;
  };

  pskl.utils.inherit(
    ns.ConsoleController,
    pskl.controller.settings.AbstractSettingController
  );

  ns.ConsoleController.prototype.init = function () {
    this.root = document.querySelector(".settings-console");
    this.commandInput = this.root.querySelector(".console-command-input");
    this.argsInput = this.root.querySelector(".console-args-input");
    this.commandList = this.root.querySelector("#console-command-list");
    this.commandHelp = this.root.querySelector(".console-command-help");
    this.status = this.root.querySelector(".console-status");
    this.runButton = this.root.querySelector(".console-run");
    this.output = this.root.querySelector(".console-output");
    this.outputCount = this.root.querySelector(".console-output-count");
    this.copyButton = this.root.querySelector(".console-copy-output");
    this.downloadButton = this.root.querySelector(".console-download-output");
    this.followCheckbox = this.root.querySelector(".console-follow-events");

    this.api = window.piskelAPI;
    if (!this.api) {
      this.setStatus_("Console API is not ready", "error");
      this.runButton.disabled = true;
      return;
    }

    this.help = this.api.help();
    this.help.forEach(
      function (item) {
        this.helpByCommand[item.command] = item;
      }.bind(this)
    );
    PSEUDO_COMMANDS.forEach(
      function (item) {
        this.helpByCommand[item.command] = item;
      }.bind(this)
    );
    this.populateCommandList_();
    this.loadHistory_();

    this.addEventListener(this.runButton, "click", this.onRun_);
    this.addEventListener(this.commandInput, "input", this.onCommandInput_);
    this.addEventListener(this.commandInput, "change", this.onCommandInput_);
    this.addEventListener(this.argsInput, "keydown", this.onEditorKeydown_);
    this.addEventListener(
      this.root.querySelector(".console-format"),
      "click",
      this.onFormatJson_
    );
    this.addEventListener(
      this.root.querySelector(".console-clear-input"),
      "click",
      this.onClearInput_
    );
    this.addEventListener(
      this.root.querySelector(".console-clear-output"),
      "click",
      this.onClearOutput_
    );
    this.addEventListener(this.copyButton, "click", this.onCopyOutput_);
    this.addEventListener(this.downloadButton, "click", this.onDownloadOutput_);
    this.addEventListener(
      this.root.querySelector(".console-history-previous"),
      "click",
      this.onPreviousHistory_
    );
    this.addEventListener(
      this.root.querySelector(".console-history-next"),
      "click",
      this.onNextHistory_
    );
    this.addEventListener(
      this.followCheckbox,
      "change",
      this.onFollowEventsChange_
    );
    Array.prototype.forEach.call(
      this.root.querySelectorAll(".console-preset"),
      function (button) {
        this.addEventListener(button, "click", this.onPresetClick_);
      }.bind(this)
    );

    this.setInput_("app.state", "{}");
    this.setStatus_(
      "Ready · v" + this.api.version + " · " + this.help.length + " commands",
      "ready"
    );
  };

  ns.ConsoleController.prototype.populateCommandList_ = function () {
    var commands = PSEUDO_COMMANDS.map(function (item) {
      return item.command;
    }).concat(
      this.help.map(function (item) {
        return item.command;
      })
    );
    commands.sort().forEach(
      function (command) {
        var option = document.createElement("option");
        option.value = command;
        var help = this.helpByCommand[command];
        option.label = help ? help.description : "";
        this.commandList.appendChild(option);
      }.bind(this)
    );
  };

  ns.ConsoleController.prototype.onCommandInput_ = function () {
    this.updateCommandHelp_();
  };

  ns.ConsoleController.prototype.updateCommandHelp_ = function () {
    var command = this.commandInput.value.trim();
    var help = this.helpByCommand[command];
    if (!command) {
      this.commandHelp.textContent =
        "Choose one of the available API commands.";
      this.commandHelp.classList.remove("console-help-error");
      return;
    }
    if (!help) {
      this.commandHelp.textContent =
        "Unknown command. Run help or select a value from the list.";
      this.commandHelp.classList.add("console-help-error");
      return;
    }
    this.commandHelp.classList.remove("console-help-error");
    this.commandHelp.textContent =
      help.args +
      " — " +
      help.description +
      (help.mutates ? " · mutates app" : "");
  };

  ns.ConsoleController.prototype.setInput_ = function (command, args) {
    this.commandInput.value = command;
    this.argsInput.value = args;
    this.updateCommandHelp_();
  };

  ns.ConsoleController.prototype.onPresetClick_ = function (event) {
    var button = event.currentTarget;
    this.setInput_(button.dataset.consoleCommand, button.dataset.consoleArgs);
    this.argsInput.focus();
    this.argsInput.select();
  };

  ns.ConsoleController.prototype.onEditorKeydown_ = function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      this.onRun_();
    } else if (event.altKey && event.key === "ArrowUp") {
      event.preventDefault();
      this.onPreviousHistory_();
    } else if (event.altKey && event.key === "ArrowDown") {
      event.preventDefault();
      this.onNextHistory_();
    }
  };

  ns.ConsoleController.prototype.parseArgs_ = function (command) {
    var source =
      this.argsInput.value.trim() || (command === "batch" ? "[]" : "{}");
    var args = JSON.parse(source);
    if (command === "batch") {
      if (!Array.isArray(args)) {
        throw new Error("batch arguments must be a JSON array");
      }
    } else if (
      args === null ||
      typeof args !== "object" ||
      Array.isArray(args)
    ) {
      throw new Error("command arguments must be a JSON object");
    }
    return args;
  };

  ns.ConsoleController.prototype.execute_ = function (command, args) {
    if (command === "help") {
      return Promise.resolve(this.api.help(args.filter));
    }
    if (command === "batch") {
      return this.api.batch(args);
    }
    if (command === "capabilities") {
      return Promise.resolve(this.api.capabilities());
    }
    if (command === "whenIdle") {
      return this.api.whenIdle();
    }
    if (command === "waitForChange") {
      return this.api.waitForChange(args);
    }
    return this.api.execute(command, args);
  };

  ns.ConsoleController.prototype.onRun_ = function () {
    if (this.running || !this.api) {
      return;
    }
    var command = this.commandInput.value.trim();
    if (!command) {
      this.appendError_("input", new Error("Command is required"), 0);
      return;
    }
    var args;
    try {
      args = this.parseArgs_(command);
    } catch (error) {
      this.appendError_(command, error, 0);
      this.setStatus_("Invalid JSON", "error");
      return;
    }

    this.pushHistory_(command, this.argsInput.value);
    this.running = true;
    this.runButton.disabled = true;
    this.setStatus_("Running " + command + "…", "running");
    var started = performance.now();
    Promise.resolve()
      .then(
        function () {
          return this.execute_(command, args);
        }.bind(this)
      )
      .then(
        function (result) {
          if (this.destroyed) {
            return;
          }
          var duration = performance.now() - started;
          this.appendResult_(command, result, duration);
          this.setStatus_(
            "Completed " + command + " in " + this.formatDuration_(duration),
            "ready"
          );
        }.bind(this),
        function (error) {
          if (this.destroyed) {
            return;
          }
          var duration = performance.now() - started;
          this.appendError_(command, error, duration);
          this.setStatus_("Command failed: " + command, "error");
        }.bind(this)
      )
      .then(
        function () {
          if (!this.destroyed) {
            this.running = false;
            this.runButton.disabled = false;
          }
        }.bind(this)
      );
  };

  ns.ConsoleController.prototype.stringify_ = function (value) {
    if (typeof value === "string") {
      return value;
    }
    if (value === undefined) {
      return "undefined";
    }
    return JSON.stringify(value, null, 2);
  };

  ns.ConsoleController.prototype.errorText_ = function (error) {
    if (error && typeof error === "object") {
      return [
        error.name || "Error",
        error.message || String(error),
        error.stack || ""
      ]
        .filter(Boolean)
        .join("\n");
    }
    return String(error);
  };

  ns.ConsoleController.prototype.appendResult_ = function (
    command,
    result,
    duration
  ) {
    var text;
    try {
      text = this.stringify_(result);
    } catch (error) {
      text = "Result could not be serialized: " + this.errorText_(error);
    }
    this.latestOutput = text;
    this.appendEntry_("success", command, text, duration, true);
  };

  ns.ConsoleController.prototype.appendError_ = function (
    command,
    error,
    duration
  ) {
    var text = this.errorText_(error);
    this.latestOutput = text;
    this.appendEntry_("error", command, text, duration, true);
  };

  ns.ConsoleController.prototype.appendEntry_ = function (
    kind,
    label,
    text,
    duration,
    updateActions
  ) {
    var entry = document.createElement("article");
    entry.className = "console-output-entry console-output-" + kind;
    entry.dataset.kind = kind;

    var header = document.createElement("header");
    header.className = "console-entry-header";
    var badge = document.createElement("span");
    badge.className = "console-entry-badge";
    badge.textContent = kind;
    var command = document.createElement("span");
    command.className = "console-entry-command";
    command.textContent = label;
    var metadata = document.createElement("span");
    metadata.className = "console-entry-metadata";
    metadata.textContent =
      new Date().toLocaleTimeString() +
      (duration === null || duration === undefined
        ? ""
        : " · " + this.formatDuration_(duration));
    header.appendChild(badge);
    header.appendChild(command);
    header.appendChild(metadata);

    var pre = document.createElement("pre");
    pre.className = "console-entry-value";
    if (text.length > MAX_VISIBLE_OUTPUT_LENGTH) {
      pre.textContent =
        text.slice(0, MAX_VISIBLE_OUTPUT_LENGTH) +
        "\n\n… output truncated in the UI (" +
        text.length +
        " characters). Copy or download to get the complete result.";
      entry.classList.add("console-output-truncated");
    } else {
      pre.textContent = text;
    }
    entry.appendChild(header);
    entry.appendChild(pre);
    this.output.appendChild(entry);

    while (this.output.children.length > MAX_OUTPUT_ENTRIES) {
      this.output.removeChild(this.output.firstElementChild);
    }
    if (updateActions) {
      this.copyButton.disabled = false;
      this.downloadButton.disabled = false;
    }
    this.updateOutputCount_();
    this.output.scrollTop = this.output.scrollHeight;
  };

  ns.ConsoleController.prototype.formatDuration_ = function (duration) {
    return duration < 1000
      ? Math.round(duration) + " ms"
      : (duration / 1000).toFixed(2) + " s";
  };

  ns.ConsoleController.prototype.setStatus_ = function (message, state) {
    this.status.textContent = message;
    this.status.dataset.state = state;
  };

  ns.ConsoleController.prototype.onFormatJson_ = function () {
    try {
      var value = JSON.parse(this.argsInput.value.trim() || "{}");
      this.argsInput.value = JSON.stringify(value, null, 2);
      this.setStatus_("JSON formatted", "ready");
    } catch (error) {
      this.appendError_("format", error, 0);
      this.setStatus_("Invalid JSON", "error");
    }
  };

  ns.ConsoleController.prototype.onClearInput_ = function () {
    this.setInput_("app.state", "{}");
    this.commandInput.focus();
  };

  ns.ConsoleController.prototype.onClearOutput_ = function () {
    this.output.textContent = "";
    this.latestOutput = null;
    this.copyButton.disabled = true;
    this.downloadButton.disabled = true;
    this.updateOutputCount_();
    this.setStatus_("Output cleared", "ready");
  };

  ns.ConsoleController.prototype.updateOutputCount_ = function () {
    var count = this.output.children.length;
    this.outputCount.textContent =
      count + (count === 1 ? " entry" : " entries");
  };

  ns.ConsoleController.prototype.copyText_ = function (text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(
        function () {
          return this.copyTextFallback_(text);
        }.bind(this)
      );
    }
    return Promise.resolve().then(
      function () {
        return this.copyTextFallback_(text);
      }.bind(this)
    );
  };

  ns.ConsoleController.prototype.copyTextFallback_ = function (text) {
    var textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    var copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!copied) {
      throw new Error("Clipboard copy is not available");
    }
  };

  ns.ConsoleController.prototype.onCopyOutput_ = function () {
    if (this.latestOutput === null) {
      return;
    }
    this.copyText_(this.latestOutput).then(
      function () {
        if (!this.destroyed) {
          this.setStatus_("Latest output copied", "ready");
        }
      }.bind(this),
      function (error) {
        if (!this.destroyed) {
          this.appendError_("copy", error, 0);
          this.setStatus_("Copy failed", "error");
        }
      }.bind(this)
    );
  };

  ns.ConsoleController.prototype.onDownloadOutput_ = function () {
    if (this.latestOutput === null) {
      return;
    }
    var blob = new Blob([this.latestOutput], {
      type: "text/plain;charset=utf-8"
    });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "piskel-console-" + Date.now() + ".txt";
    link.addEventListener("click", function (event) {
      event.stopPropagation();
    });
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
    this.setStatus_("Latest output downloaded", "ready");
  };

  ns.ConsoleController.prototype.onFollowEventsChange_ = function () {
    if (this.followCheckbox.checked) {
      if (!this.changeUnsubscribe) {
        this.changeUnsubscribe = this.api.on(
          "change",
          this.onApiChange_.bind(this)
        );
      }
      this.setStatus_("Following API changes", "ready");
    } else {
      this.stopFollowingEvents_();
      this.setStatus_("Change stream paused", "ready");
    }
  };

  ns.ConsoleController.prototype.onApiChange_ = function (event) {
    if (this.destroyed) {
      return;
    }
    this.appendEntry_(
      "event",
      event.type + " #" + event.revision,
      this.stringify_(event),
      null,
      false
    );
  };

  ns.ConsoleController.prototype.stopFollowingEvents_ = function () {
    if (this.changeUnsubscribe) {
      this.changeUnsubscribe();
      this.changeUnsubscribe = null;
    }
  };

  ns.ConsoleController.prototype.pushHistory_ = function (command, args) {
    var entry = { command: command, args: args };
    var serialized = JSON.stringify(entry);
    if (serialized.length <= MAX_HISTORY_ENTRY_LENGTH) {
      var previous = this.history[this.history.length - 1];
      if (!previous || previous.command !== command || previous.args !== args) {
        this.history.push(entry);
      }
      this.history = this.history.slice(-MAX_HISTORY);
      this.saveHistory_();
    }
    this.historyIndex = this.history.length;
  };

  ns.ConsoleController.prototype.onPreviousHistory_ = function () {
    if (!this.history.length) {
      return;
    }
    this.historyIndex = Math.max(0, this.historyIndex - 1);
    var entry = this.history[this.historyIndex];
    this.setInput_(entry.command, entry.args);
  };

  ns.ConsoleController.prototype.onNextHistory_ = function () {
    if (!this.history.length) {
      return;
    }
    this.historyIndex = Math.min(this.history.length, this.historyIndex + 1);
    if (this.historyIndex === this.history.length) {
      this.setInput_("app.state", "{}");
      return;
    }
    var entry = this.history[this.historyIndex];
    this.setInput_(entry.command, entry.args);
  };

  ns.ConsoleController.prototype.loadHistory_ = function () {
    try {
      var history = JSON.parse(
        window.sessionStorage.getItem(HISTORY_KEY) || "[]"
      );
      if (Array.isArray(history)) {
        this.history = history.filter(function (entry) {
          return (
            entry &&
            typeof entry.command === "string" &&
            typeof entry.args === "string"
          );
        });
      }
    } catch {
      this.history = [];
    }
    this.history = this.history.slice(-MAX_HISTORY);
    this.historyIndex = this.history.length;
  };

  ns.ConsoleController.prototype.saveHistory_ = function () {
    try {
      window.sessionStorage.setItem(HISTORY_KEY, JSON.stringify(this.history));
    } catch {
      // History persistence is optional (for example in private browsing mode).
    }
  };

  ns.ConsoleController.prototype.destroy = function () {
    this.destroyed = true;
    this.stopFollowingEvents_();
    this.saveHistory_();
    this.superclass.destroy.call(this);
  };
})();
