/** Console and automation facade. No eval, network listener or private-object exposure. */
(function () {
  var ns = $.namespace("pskl.api");

  ns.create = function (app) {
    var commands = Object.create(null);
    var api = { version: "2.0.0" };
    var queue = Promise.resolve();
    var pendingCommands = 0;
    var currentCommand = null;
    var revision = 0;
    var eventLog = [];
    var listeners = Object.create(null);
    var apiClipboard = null;
    var c = app.corePiskelController;
    var pub = app.piskelController;

    var MAX_DIMENSION = 2048;
    var MAX_DOCUMENT_PIXELS = 16777216;
    var MAX_LAYERS = 256;
    var MAX_FRAMES = 10000;
    var MAX_BATCH = 1000;
    var MAX_EVENT_LOG = 200;
    var PUBLIC_EVENTS = [
      "change",
      "document",
      "settings",
      "history",
      "selection",
      "palette",
      "tool",
      "view",
      "save",
      "ui"
    ];
    var RESIZE_ORIGINS = [
      "TOPLEFT",
      "TOP",
      "TOPRIGHT",
      "MIDDLELEFT",
      "MIDDLE",
      "MIDDLERIGHT",
      "BOTTOMLEFT",
      "BOTTOM",
      "BOTTOMRIGHT"
    ];
    var SETTING_SCHEMA = {
      GRID_COLOR: { type: "color" },
      GRID_ENABLED: { type: "boolean" },
      GRID_WIDTH: { type: "integer", min: 1, max: 256 },
      GRID_SPACING: { type: "integer", min: 1, max: 256 },
      MAX_FPS: { type: "integer", min: 1, max: 60 },
      DEFAULT_SIZE: { type: "size" },
      CANVAS_BACKGROUND: {
        type: "enum",
        values: [
          "light-canvas-background",
          "medium-canvas-background",
          "lowcont-medium-canvas-background",
          "lowcont-dark-canvas-background"
        ]
      },
      SELECTED_PALETTE: { type: "palette" },
      SEAMLESS_OPACITY: { type: "number", min: 0, max: 1 },
      SEAMLESS_MODE: { type: "boolean" },
      PREVIEW_SIZE: { type: "enum", values: ["original", "best", "full"] },
      ONION_SKIN: { type: "boolean" },
      LAYER_PREVIEW: { type: "boolean" },
      LAYER_OPACITY: { type: "number", min: 0, max: 1 },
      EXPORT_SCALE: { type: "number", min: 0.01, max: 32 },
      EXPORT_TAB: { type: "enum", values: ["gif", "png", "zip", "misc"] },
      EXPORT_GIF_REPEAT: { type: "boolean" },
      PEN_SIZE: { type: "integer", min: 1, max: 32 },
      RESIZE_SETTINGS: { type: "resize" },
      COLOR_FORMAT: { type: "enum", values: ["hex", "rgb"] },
      TRANSFORM_SHOW_MORE: { type: "boolean" },
      PREFERENCES_TAB: { type: "enum", values: ["misc", "grid", "tile"] }
    };

    function assert(ok, message) {
      if (!ok) {
        throw new Error(message);
      }
    }
    function hasOwn(target, key) {
      return Object.prototype.hasOwnProperty.call(target, key);
    }
    function clone(value) {
      if (value === undefined) {
        return undefined;
      }
      return JSON.parse(JSON.stringify(value));
    }
    function object(value, label) {
      assert(
        value !== null && typeof value === "object" && !Array.isArray(value),
        label + " must be an object"
      );
      return value;
    }
    function integer(value, min, max, label) {
      assert(
        Number.isInteger(value) && value >= min && value <= max,
        label + " must be an integer in [" + min + ", " + max + "]"
      );
      return value;
    }
    function number(value, min, max, label) {
      assert(
        Number.isFinite(value) && value >= min && value <= max,
        label + " must be a number in [" + min + ", " + max + "]"
      );
      return value;
    }
    function text(value, label) {
      assert(
        typeof value === "string" && value.trim().length > 0,
        label + " must be a non-empty string"
      );
      return value;
    }
    function oneOf(value, values, label) {
      assert(
        values.indexOf(value) !== -1,
        label + " must be one of: " + values.join(", ")
      );
      return value;
    }
    function color(value) {
      if (value === "transparent" || value === Constants.TRANSPARENT_COLOR) {
        return Constants.TRANSPARENT_COLOR;
      }
      assert(
        typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value),
        "color must be #RRGGBB or transparent"
      );
      return value.toLowerCase();
    }
    function settingColor(value) {
      if (value === "transparent" || value === Constants.TRANSPARENT_COLOR) {
        return Constants.TRANSPARENT_COLOR;
      }
      assert(
        typeof value === "string" &&
          (/^#[0-9a-f]{3}$/i.test(value) || /^#[0-9a-f]{6}$/i.test(value)),
        "value must be #RGB, #RRGGBB or transparent"
      );
      return value.toLowerCase();
    }
    function layer(a) {
      return integer(
        a.layer === undefined ? c.getCurrentLayerIndex() : a.layer,
        0,
        c.getLayers().length - 1,
        "layer"
      );
    }
    function frame(a) {
      return integer(
        a.frame === undefined ? c.getCurrentFrameIndex() : a.frame,
        0,
        c.getFrameCount() - 1,
        "frame"
      );
    }
    function checkCapacity(width, height, layers, frames) {
      assert(
        layers >= 1 && layers <= MAX_LAYERS,
        "Document has too many layers"
      );
      assert(
        frames >= 1 && frames <= MAX_FRAMES,
        "Document has too many frames"
      );
      assert(
        width * height * layers * frames <= MAX_DOCUMENT_PIXELS,
        "Document too large"
      );
    }
    function capacity(layers, frames) {
      checkCapacity(c.getWidth(), c.getHeight(), layers, frames);
    }
    function snapshot() {
      $.publish(Events.PISKEL_RESET);
      $.publish(Events.PISKEL_SAVE_STATE, {
        type: pskl.service.HistoryService.SNAPSHOT
      });
    }
    function getUserSettings() {
      return pskl.UserSettings && pskl.UserSettings.KEY_TO_DEFAULT_VALUE_MAP_
        ? pskl.UserSettings
        : null;
    }
    function readSettings() {
      var userSettings = getUserSettings();
      var values = {};
      if (!userSettings) {
        return values;
      }
      Object.keys(userSettings.KEY_TO_DEFAULT_VALUE_MAP_).forEach(
        function (key) {
          values[key] = clone(userSettings.get(key));
        }
      );
      return values;
    }
    function historyState() {
      var h = app.historyService;
      if (!h || !Array.isArray(h.stateQueue)) {
        return {
          enabled: false,
          index: -1,
          length: 0,
          canUndo: false,
          canRedo: false,
          currentStateId: null
        };
      }
      return {
        enabled: true,
        index: h.currentIndex,
        length: h.stateQueue.length,
        canUndo: h.currentIndex > 0,
        canRedo:
          h.currentIndex >= 0 && h.currentIndex < h.stateQueue.length - 1,
        currentStateId: h.getCurrentStateId
          ? h.getCurrentStateId() || null
          : null
      };
    }
    function selectionState() {
      var selection =
        app.selectionManager && app.selectionManager.currentSelection;
      if (!selection) {
        return {
          active: false,
          count: 0,
          bounds: null,
          hasPastedContent: false
        };
      }
      var pixels = selection.pixels || [];
      var bounds = null;
      pixels.forEach(function (pixel) {
        if (!bounds) {
          bounds = {
            x: pixel.col,
            y: pixel.row,
            width: 1,
            height: 1,
            maxX: pixel.col,
            maxY: pixel.row
          };
          return;
        }
        var minX = Math.min(bounds.x, pixel.col);
        var minY = Math.min(bounds.y, pixel.row);
        bounds.maxX = Math.max(bounds.maxX, pixel.col);
        bounds.maxY = Math.max(bounds.maxY, pixel.row);
        bounds.x = minX;
        bounds.y = minY;
        bounds.width = bounds.maxX - minX + 1;
        bounds.height = bounds.maxY - minY + 1;
      });
      return {
        active: true,
        count: pixels.length,
        bounds: bounds,
        hasPastedContent: !!selection.hasPastedContent
      };
    }
    function viewState() {
      var dc = app.drawingController;
      var zoom = null;
      var offset = null;
      if (dc) {
        var renderer = dc.getRenderer ? dc.getRenderer() : dc.compositeRenderer;
        zoom = renderer && renderer.getZoom ? renderer.getZoom() : null;
        offset = dc.getOffset ? clone(dc.getOffset()) : null;
      }
      var preview = app.previewController;
      var popup = preview && preview.popupPreviewController;
      var settings = app.settingsController;
      var dialogs = app.dialogsController;
      return {
        zoom: zoom,
        offset: offset,
        previewFrame:
          preview && Number.isInteger(preview.currentIndex)
            ? preview.currentIndex
            : null,
        popupPreviewOpen: !!(popup && popup.isOpen && popup.isOpen()),
        settingsPanel:
          settings && settings.isExpanded ? settings.currentSetting : null,
        dialog:
          dialogs && dialogs.getCurrentDialogId_
            ? dialogs.getCurrentDialogId_()
            : null
      };
    }
    function documentSummary() {
      var piskel = c.getPiskel();
      var descriptor = piskel.getDescriptor();
      return {
        modelVersion: Constants.MODEL_VERSION,
        name: descriptor.name,
        description: descriptor.description,
        isPublic: !!descriptor.isPublic,
        width: c.getWidth(),
        height: c.getHeight(),
        fps: c.getFPS(),
        currentLayer: c.getCurrentLayerIndex(),
        currentFrame: c.getCurrentFrameIndex(),
        layerCount: c.getLayers().length,
        frameCount: c.getFrameCount(),
        hiddenFrames: piskel.hiddenFrames.slice(),
        hash: piskel.getHash(),
        layers: c.getLayers().map(function (item, index) {
          return {
            index: index,
            name: item.getName(),
            opacity: item.getOpacity()
          };
        })
      };
    }
    function fileState(includeSerialized) {
      var piskel = c.getPiskel();
      var descriptor = piskel.getDescriptor();
      var result = {
        name: descriptor.name,
        description: descriptor.description,
        isPublic: !!descriptor.isPublic,
        modelVersion: Constants.MODEL_VERSION,
        extension: ".piskel",
        width: c.getWidth(),
        height: c.getHeight(),
        fps: c.getFPS(),
        layerCount: c.getLayers().length,
        frameCount: c.getFrameCount(),
        hiddenFrames: piskel.hiddenFrames.slice(),
        savePath: typeof piskel.savePath === "string" ? piskel.savePath : null,
        dirty:
          app.savedStatusService && app.savedStatusService.isDirty
            ? !!app.savedStatusService.isDirty()
            : null,
        saving:
          app.storageService && app.storageService.isSaving
            ? !!app.storageService.isSaving()
            : false,
        hash: piskel.getHash()
      };
      if (includeSerialized) {
        result.serialized = c.serialize();
        result.bytes = result.serialized.length;
      }
      return result;
    }
    function state(a) {
      a = a || {};
      var document = a.includePixels
        ? readDocument({
            pixels: a.includePixels === true ? "all" : a.includePixels,
            format: a.pixelFormat || "rows"
          })
        : documentSummary();
      var selectedPalette = null;
      var userSettings = getUserSettings();
      if (userSettings) {
        selectedPalette = userSettings.get(userSettings.SELECTED_PALETTE);
      }
      var tool =
        app.toolController && app.toolController.currentSelectedTool
          ? app.toolController.currentSelectedTool.toolId
          : null;
      var result = {
        apiVersion: api.version,
        revision: revision,
        ready: true,
        pendingCommands: pendingCommands,
        currentCommand: currentCommand,
        document: document,
        file: fileState(!!a.includeSerialized),
        settings: a.includeSettings === false ? undefined : readSettings(),
        history: historyState(),
        selection: selectionState(),
        view: viewState(),
        palette: { selectedId: selectedPalette },
        name: document.name,
        description: document.description,
        width: document.width,
        height: document.height,
        fps: document.fps,
        layer: document.currentLayer,
        frame: document.currentFrame,
        frameCount: document.frameCount,
        hiddenFrames: document.hiddenFrames.slice(),
        layers: document.layers.map(function (item) {
          return { index: item.index, name: item.name, opacity: item.opacity };
        }),
        tool: tool,
        primaryColor:
          app.selectedColorsService && app.selectedColorsService.getPrimaryColor
            ? app.selectedColorsService.getPrimaryColor()
            : null,
        secondaryColor:
          app.selectedColorsService &&
          app.selectedColorsService.getSecondaryColor
            ? app.selectedColorsService.getSecondaryColor()
            : null,
        penSize:
          app.penSizeService && app.penSizeService.getPenSize
            ? app.penSizeService.getPenSize()
            : null
      };
      if (a.includePalettes && app.paletteService) {
        result.palettes = listPalettes();
      }
      if (result.settings === undefined) {
        delete result.settings;
      }
      return clone(result);
    }
    function register(name, args, description, fn, metadata) {
      assert(!hasOwn(commands, name), "Duplicate command: " + name);
      metadata = metadata || {};
      var action = name.split(".")[1];
      var readOnlyActions = [
        "state",
        "read",
        "list",
        "get",
        "colors",
        "schema",
        "capabilities",
        "changes",
        "snapshot",
        "snapshots",
        "export",
        "clipboard"
      ];
      var mutates =
        metadata.mutates === undefined
          ? readOnlyActions.indexOf(action) === -1
          : !!metadata.mutates;
      commands[name] = {
        args: args,
        description: description,
        run: fn,
        mutates: mutates,
        returns: metadata.returns || "JSON"
      };
      var parts = name.split(".");
      api[parts[0]] = api[parts[0]] || {};
      api[parts[0]][parts[1]] = function (params) {
        return api.execute(name, params);
      };
    }
    api.help = function (filter) {
      return Object.keys(commands)
        .filter(function (name) {
          return !filter || name === filter || name.indexOf(filter + ".") === 0;
        })
        .map(function (name) {
          return {
            command: name,
            group: name.split(".")[0],
            args: commands[name].args,
            description: commands[name].description,
            mutates: commands[name].mutates,
            returns: commands[name].returns
          };
        });
    };
    api.capabilities = function () {
      var groups = {};
      Object.keys(commands).forEach(function (name) {
        var group = name.split(".")[0];
        groups[group] = groups[group] || [];
        groups[group].push(name);
      });
      return {
        version: api.version,
        commands: Object.keys(commands),
        groups: groups,
        events: PUBLIC_EVENTS.slice(),
        formats: {
          pixels: ["rows", "flat", "sparse", "uint32"],
          fileExport: ["piskel", "png", "gif", "zip", "pixi", "c"],
          imageImport: ["png", "gif", "jpeg", "webp", "bmp"],
          palette: ["json", "gpl", "hex"]
        },
        settings: Object.keys(SETTING_SCHEMA),
        limits: {
          maxDimension: MAX_DIMENSION,
          maxLayers: MAX_LAYERS,
          maxFrames: MAX_FRAMES,
          maxDocumentPixels: MAX_DOCUMENT_PIXELS,
          maxBatch: MAX_BATCH
        }
      };
    };
    api.execute = function (command, args) {
      if (command && typeof command === "object") {
        args = command.args;
        command = command.command;
      }
      pendingCommands++;
      var run = queue.then(function () {
        assert(
          typeof command === "string" && hasOwn(commands, command),
          "Unknown command: " + command
        );
        assert(
          args === undefined ||
            (args !== null && typeof args === "object" && !Array.isArray(args)),
          "args must be an object"
        );
        currentCommand = command;
        return commands[command].run(args || {});
      });
      queue = run.catch(function () {});
      return run.then(
        function (value) {
          pendingCommands--;
          currentCommand = null;
          return value;
        },
        function (error) {
          pendingCommands--;
          currentCommand = null;
          throw error;
        }
      );
    };
    api.batch = async function (items) {
      assert(
        Array.isArray(items) && items.length <= MAX_BATCH,
        "batch must contain at most " + MAX_BATCH + " commands"
      );
      var results = [];
      for (var i = 0; i < items.length; i++) {
        results.push(await api.execute(items[i]));
      }
      return results;
    };
    api.whenIdle = function () {
      return queue.then(function () {
        return state();
      });
    };
    api.on = function (type, callback) {
      oneOf(type, PUBLIC_EVENTS, "event type");
      assert(typeof callback === "function", "callback must be a function");
      listeners[type] = listeners[type] || [];
      listeners[type].push(callback);
      return function () {
        api.off(type, callback);
      };
    };
    api.off = function (type, callback) {
      if (!listeners[type]) {
        return;
      }
      listeners[type] = listeners[type].filter(function (item) {
        return item !== callback;
      });
    };
    api.once = function (type, callback) {
      var unsubscribe = api.on(type, function (event) {
        unsubscribe();
        callback(event);
      });
      return unsubscribe;
    };

    register(
      "app.state",
      "{includeSettings=true,includePixels=false,pixelFormat='rows',includeSerialized=false,includePalettes=false}",
      "Read the live editor, current file, settings, history, selection and view state.",
      state
    );
    register(
      "app.snapshot",
      "{includePixels='all',pixelFormat='rows',includeSerialized=true,includePalettes=true}",
      "Capture a complete JSON-safe editor snapshot for inspection or automation.",
      function (a) {
        return state({
          includeSettings: a.includeSettings !== false,
          includePixels:
            a.includePixels === undefined ? "all" : a.includePixels,
          pixelFormat: a.pixelFormat || "rows",
          includeSerialized: a.includeSerialized !== false,
          includePalettes: a.includePalettes !== false
        });
      }
    );
    register(
      "app.capabilities",
      "{}",
      "List commands, event names and safety limits.",
      function () {
        return api.capabilities();
      }
    );
    register(
      "app.changes",
      "{since=0,type?}",
      "Read the bounded change log after a revision number.",
      function (a) {
        var since = integer(
          a.since === undefined ? 0 : a.since,
          0,
          Number.MAX_SAFE_INTEGER,
          "since"
        );
        if (a.type !== undefined) {
          oneOf(a.type, PUBLIC_EVENTS.slice(1), "type");
        }
        return {
          revision: revision,
          oldestRevision: eventLog.length ? eventLog[0].revision : revision,
          events: clone(
            eventLog.filter(function (event) {
              return (
                event.revision > since && (!a.type || event.type === a.type)
              );
            })
          )
        };
      }
    );
    function pixelValue(value) {
      if (Number.isInteger(value) && value >= 0 && value <= 0xffffffff) {
        return value;
      }
      if (value === "transparent" || value === Constants.TRANSPARENT_COLOR) {
        return Constants.TRANSPARENT_COLOR;
      }
      assert(
        typeof value === "string" &&
          (/^#[0-9a-f]{6}$/i.test(value) ||
            /^rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\)$/i.test(
              value
            )),
        "pixel color must be uint32, #RRGGBB, rgba(...) or transparent"
      );
      return value;
    }
    function readFramePixels(target, format) {
      oneOf(format, ["rows", "flat", "sparse", "uint32"], "format");
      var width = target.getWidth();
      var height = target.getHeight();
      if (format === "uint32") {
        return Array.from(target.getPixels());
      }
      if (format === "flat") {
        return Array.from(target.getPixels()).map(function (value) {
          return pskl.utils.intToColor(value);
        });
      }
      if (format === "sparse") {
        var transparent = pskl.utils.colorToInt(Constants.TRANSPARENT_COLOR);
        var sparse = [];
        target.forEachPixel(function (value, x, y) {
          if (value !== transparent) {
            sparse.push({ x: x, y: y, color: pskl.utils.intToColor(value) });
          }
        });
        return sparse;
      }
      var rows = [];
      for (var y = 0; y < height; y++) {
        var row = [];
        for (var x = 0; x < width; x++) {
          row.push(pskl.utils.intToColor(target.getPixel(x, y)));
        }
        rows.push(row);
      }
      return rows;
    }
    function inferPixelFormat(pixels, declared) {
      if (declared) {
        return oneOf(declared, ["rows", "flat", "sparse", "uint32"], "format");
      }
      if (
        Array.isArray(pixels) &&
        pixels.length &&
        pixels[0] &&
        typeof pixels[0] === "object" &&
        !Array.isArray(pixels[0])
      ) {
        return "sparse";
      }
      if (Array.isArray(pixels) && pixels.length && Array.isArray(pixels[0])) {
        return "rows";
      }
      if (
        Array.isArray(pixels) &&
        pixels.some(function (value) {
          return typeof value === "string";
        })
      ) {
        return "flat";
      }
      return "uint32";
    }
    function writeFramePixels(target, pixels, format, clearFirst) {
      assert(Array.isArray(pixels), "pixels must be an array");
      format = inferPixelFormat(pixels, format);
      var width = target.getWidth();
      var height = target.getHeight();
      var next =
        clearFirst === false
          ? target.clone()
          : new pskl.model.Frame(width, height);
      if (format === "rows") {
        assert(pixels.length === height, "rows must match document height");
        pixels.forEach(function (row, y) {
          assert(
            Array.isArray(row) && row.length === width,
            "each row must match document width"
          );
          row.forEach(function (value, x) {
            next.setPixel(x, y, pixelValue(value));
          });
        });
      } else if (format === "flat" || format === "uint32") {
        assert(
          pixels.length === width * height,
          "flat pixels must match width * height"
        );
        pixels.forEach(function (value, index) {
          next.setPixel(
            index % width,
            Math.floor(index / width),
            pixelValue(value)
          );
        });
      } else {
        assert(
          pixels.length <= width * height,
          "sparse pixels contain too many entries"
        );
        pixels.forEach(function (item) {
          object(item, "pixel");
          integer(item.x, 0, width - 1, "x");
          integer(item.y, 0, height - 1, "y");
          next.setPixel(item.x, item.y, pixelValue(item.color));
        });
      }
      return next;
    }
    function readDocument(a) {
      a = a || {};
      var pixelScope = a.pixels === undefined ? "all" : a.pixels;
      if (pixelScope === true) {
        pixelScope = "all";
      } else if (pixelScope === false) {
        pixelScope = "none";
      }
      oneOf(pixelScope, ["none", "current", "all"], "pixels");
      var format = a.format || "rows";
      oneOf(format, ["rows", "flat", "sparse", "uint32"], "format");
      var summary = documentSummary();
      summary.pixelFormat = format;
      summary.layers = c.getLayers().map(function (item, layerIndex) {
        return {
          index: layerIndex,
          name: item.getName(),
          opacity: item.getOpacity(),
          frames: item.getFrames().map(function (target, frameIndex) {
            var result = {
              index: frameIndex,
              hidden: c.getPiskel().hiddenFrames.indexOf(frameIndex) !== -1,
              hash: target.getHash()
            };
            var include =
              pixelScope === "all" ||
              (pixelScope === "current" &&
                layerIndex === c.getCurrentLayerIndex() &&
                frameIndex === c.getCurrentFrameIndex());
            if (include) {
              result.pixels = readFramePixels(target, format);
            }
            return result;
          })
        };
      });
      return clone(summary);
    }
    function buildDocument(data) {
      object(data, "document");
      var width = integer(data.width, 1, MAX_DIMENSION, "width");
      var height = integer(data.height, 1, MAX_DIMENSION, "height");
      var fps = integer(data.fps === undefined ? 12 : data.fps, 1, 60, "fps");
      var name = text(
        data.name === undefined ? "New Piskel" : data.name,
        "name"
      );
      assert(
        data.description === undefined || typeof data.description === "string",
        "description must be a string"
      );
      assert(
        Array.isArray(data.layers) && data.layers.length > 0,
        "layers must not be empty"
      );
      integer(data.layers.length, 1, MAX_LAYERS, "layer count");
      object(data.layers[0], "layer");
      assert(
        Array.isArray(data.layers[0].frames) &&
          data.layers[0].frames.length > 0,
        "layer frames must not be empty"
      );
      checkCapacity(
        width,
        height,
        data.layers.length,
        data.layers[0].frames.length
      );
      var frameCount = null;
      var model = new pskl.model.Piskel(
        width,
        height,
        fps,
        new pskl.model.piskel.Descriptor(
          name,
          data.description || "",
          !!data.isPublic
        )
      );
      data.layers.forEach(function (layerData, layerIndex) {
        object(layerData, "layer");
        var layerName = text(
          layerData.name || "Layer " + (layerIndex + 1),
          "layer name"
        );
        assert(
          Array.isArray(layerData.frames) && layerData.frames.length > 0,
          "layer frames must not be empty"
        );
        frameCount = frameCount === null ? layerData.frames.length : frameCount;
        assert(
          layerData.frames.length === frameCount,
          "All layers must have equal frame counts"
        );
        var nextLayer = new pskl.model.Layer(layerName);
        if (layerData.opacity !== undefined) {
          number(layerData.opacity, 0, 1, "opacity");
          nextLayer.setOpacity(layerData.opacity);
        }
        layerData.frames.forEach(function (frameData) {
          object(frameData, "frame");
          var nextFrame = writeFramePixels(
            new pskl.model.Frame(width, height),
            frameData.pixels,
            frameData.format || data.pixelFormat,
            true
          );
          nextLayer.addFrame(nextFrame);
        });
        model.addLayer(nextLayer);
      });
      checkCapacity(width, height, data.layers.length, frameCount);
      var hiddenFrames =
        data.hiddenFrames === undefined ? [] : data.hiddenFrames;
      assert(Array.isArray(hiddenFrames), "hiddenFrames must be an array");
      model.hiddenFrames = hiddenFrames.map(function (index) {
        return integer(index, 0, frameCount - 1, "hidden frame");
      });
      model.hiddenFrames = Array.from(new Set(model.hiddenFrames)).sort(
        function (a, b) {
          return a - b;
        }
      );
      if (typeof data.savePath === "string") {
        model.savePath = data.savePath;
      }
      return model;
    }

    register(
      "document.read",
      "{pixels='all'|'current'|'none',format='rows'|'flat'|'sparse'|'uint32'}",
      "Read every layer/frame and optionally exact pixel data from the current drawing.",
      readDocument
    );
    register(
      "document.state",
      "{pixels='none',format='rows'}",
      "Read document metadata; optionally include current/all frame pixels.",
      function (a) {
        return readDocument(
          Object.assign({}, a, {
            pixels: a.pixels === undefined ? "none" : a.pixels
          })
        );
      }
    );
    register(
      "document.write",
      "{document:{name,width,height,fps,layers:[{name,opacity,frames:[{pixels}]}]}}",
      "Atomically replace the drawing from a structured document returned by document.read.",
      function (a) {
        var model = buildDocument(a.document || a);
        pub.setPiskel(model);
        return state();
      },
      { mutates: true }
    );
    register(
      "document.colors",
      "{}",
      "Count exact colors across every layer and frame.",
      function () {
        var counts = Object.create(null);
        c.getLayers().forEach(function (item) {
          item.getFrames().forEach(function (target) {
            target.forEachPixel(function (value) {
              var key = pskl.utils.intToColor(value);
              counts[key] = (counts[key] || 0) + 1;
            });
          });
        });
        return Object.keys(counts)
          .map(function (key) {
            return { color: key, count: counts[key] };
          })
          .sort(function (a, b) {
            return b.count - a.count || a.color.localeCompare(b.color);
          });
      }
    );
    register(
      "document.new",
      "{width=32,height=32,name='New Piskel',description='',isPublic=false,fps=12,frameCount=1,layerNames=['Layer 1'],hiddenFrames=[]}",
      "Replace the current document with a validated blank drawing.",
      function (a) {
        var width = integer(
          a.width === undefined ? 32 : a.width,
          1,
          MAX_DIMENSION,
          "width"
        );
        var height = integer(
          a.height === undefined ? 32 : a.height,
          1,
          MAX_DIMENSION,
          "height"
        );
        var fps = integer(a.fps === undefined ? 12 : a.fps, 1, 60, "fps");
        var frameCount = integer(
          a.frameCount === undefined ? 1 : a.frameCount,
          1,
          MAX_FRAMES,
          "frameCount"
        );
        var name = text(a.name === undefined ? "New Piskel" : a.name, "name");
        assert(
          a.description === undefined || typeof a.description === "string",
          "description must be a string"
        );
        assert(
          a.isPublic === undefined || typeof a.isPublic === "boolean",
          "isPublic must be boolean"
        );
        var layerNames =
          a.layerNames === undefined ? ["Layer 1"] : a.layerNames;
        assert(
          Array.isArray(layerNames) && layerNames.length > 0,
          "layerNames must not be empty"
        );
        integer(layerNames.length, 1, MAX_LAYERS, "layer count");
        var seenNames = Object.create(null);
        layerNames.forEach(function (layerName) {
          text(layerName, "layer name");
          assert(!seenNames[layerName], "Layer names must be unique");
          seenNames[layerName] = true;
        });
        checkCapacity(width, height, layerNames.length, frameCount);
        var model = new pskl.model.Piskel(
          width,
          height,
          fps,
          new pskl.model.piskel.Descriptor(
            name,
            a.description || "",
            !!a.isPublic
          )
        );
        layerNames.forEach(function (layerName) {
          var nextLayer = new pskl.model.Layer(layerName);
          for (var i = 0; i < frameCount; i++) {
            nextLayer.addFrame(new pskl.model.Frame(width, height));
          }
          model.addLayer(nextLayer);
        });
        var hiddenFrames = a.hiddenFrames === undefined ? [] : a.hiddenFrames;
        assert(Array.isArray(hiddenFrames), "hiddenFrames must be an array");
        model.hiddenFrames = hiddenFrames.map(function (index) {
          return integer(index, 0, frameCount - 1, "hidden frame");
        });
        model.hiddenFrames = Array.from(new Set(model.hiddenFrames)).sort(
          function (x, y) {
            return x - y;
          }
        );
        pub.setPiskel(model);
        return state();
      },
      { mutates: true }
    );
    register(
      "document.update",
      "{name?,description?,isPublic?,fps?}",
      "Update document metadata and playback rate.",
      function (a) {
        if (a.name !== undefined) {
          text(a.name, "name");
        }
        if (a.description !== undefined) {
          assert(
            typeof a.description === "string",
            "description must be a string"
          );
        }
        if (a.isPublic !== undefined) {
          assert(typeof a.isPublic === "boolean", "isPublic must be boolean");
        }
        if (a.fps !== undefined) {
          integer(a.fps, 1, 60, "fps");
        }
        var descriptor = c.getPiskel().getDescriptor();
        var changed = false;
        if (a.name !== undefined && descriptor.name !== a.name) {
          descriptor.name = a.name;
          changed = true;
        }
        if (
          a.description !== undefined &&
          descriptor.description !== a.description
        ) {
          descriptor.description = a.description;
          changed = true;
        }
        if (a.isPublic !== undefined && !!descriptor.isPublic !== a.isPublic) {
          descriptor.isPublic = a.isPublic;
          changed = true;
        }
        if (a.fps !== undefined && c.getFPS() !== a.fps) {
          c.setFPS(a.fps);
          changed = true;
        }
        if (changed) {
          snapshot();
        }
        return state();
      },
      { mutates: true }
    );
    register(
      "document.resize",
      "{width,height,resizeContent=false,origin='TOPLEFT'}",
      "Resize every frame using nearest-neighbor scaling or crop/pad at any of nine anchors.",
      function (a) {
        var width = integer(a.width, 1, MAX_DIMENSION, "width");
        var height = integer(a.height, 1, MAX_DIMENSION, "height");
        if (a.resizeContent !== undefined) {
          assert(
            typeof a.resizeContent === "boolean",
            "resizeContent must be boolean"
          );
        }
        var resizeContent = !!a.resizeContent;
        var origin = oneOf(a.origin || "TOPLEFT", RESIZE_ORIGINS, "origin");
        checkCapacity(width, height, c.getLayers().length, c.getFrameCount());
        var oldModel = c.getPiskel();
        var oldDescriptor = oldModel.getDescriptor();
        var model = new pskl.model.Piskel(
          width,
          height,
          c.getFPS(),
          new pskl.model.piskel.Descriptor(
            oldDescriptor.name,
            oldDescriptor.description,
            oldDescriptor.isPublic
          )
        );
        c.getLayers().forEach(function (oldLayer) {
          var nextLayer = new pskl.model.Layer(oldLayer.getName());
          nextLayer.setOpacity(oldLayer.getOpacity());
          oldLayer.getFrames().forEach(function (oldFrame) {
            var nextFrame = new pskl.model.Frame(width, height);
            if (resizeContent) {
              for (var y = 0; y < height; y++) {
                for (var x = 0; x < width; x++) {
                  var sourceX = Math.min(
                    oldFrame.getWidth() - 1,
                    Math.floor((x * oldFrame.getWidth()) / width)
                  );
                  var sourceY = Math.min(
                    oldFrame.getHeight() - 1,
                    Math.floor((y * oldFrame.getHeight()) / height)
                  );
                  nextFrame.setPixel(x, y, oldFrame.getPixel(sourceX, sourceY));
                }
              }
            } else {
              var offsetX =
                origin.indexOf("LEFT") !== -1
                  ? 0
                  : origin.indexOf("RIGHT") !== -1
                    ? width - oldFrame.getWidth()
                    : Math.round((width - oldFrame.getWidth()) / 2);
              var offsetY =
                origin.indexOf("TOP") !== -1
                  ? 0
                  : origin.indexOf("BOTTOM") !== -1
                    ? height - oldFrame.getHeight()
                    : Math.round((height - oldFrame.getHeight()) / 2);
              oldFrame.forEachPixel(function (value, x, y) {
                if (nextFrame.containsPixel(x + offsetX, y + offsetY)) {
                  nextFrame.setPixel(x + offsetX, y + offsetY, value);
                }
              });
            }
            nextLayer.addFrame(nextFrame);
          });
          model.addLayer(nextLayer);
        });
        model.hiddenFrames = oldModel.hiddenFrames.slice();
        model.savePath = oldModel.savePath;
        pub.setPiskel(model, { preserveState: true });
        return state();
      },
      { mutates: true }
    );
    function exportScale(value) {
      return number(value === undefined ? 1 : value, 0.01, 32, "scale");
    }
    function exportFrameIndexes(a) {
      var indexes;
      if (a.frame !== undefined) {
        indexes = [frame({ frame: a.frame })];
      } else if (a.frames !== undefined) {
        assert(
          Array.isArray(a.frames) && a.frames.length > 0,
          "frames must not be empty"
        );
        indexes = a.frames.map(function (index) {
          return frame({ frame: index });
        });
      } else {
        indexes = [];
        for (var i = 0; i < c.getFrameCount(); i++) {
          if (!a.visibleOnly || c.getPiskel().hiddenFrames.indexOf(i) === -1) {
            indexes.push(i);
          }
        }
      }
      assert(indexes.length > 0, "No frame selected for export");
      assert(new Set(indexes).size === indexes.length, "frames must be unique");
      return indexes;
    }
    function renderFrameCanvas(frameIndex, layerIndex) {
      return layerIndex === undefined
        ? c.renderFrameAt(frameIndex, true)
        : pskl.utils.LayerUtils.renderFrameAt(
            c.getLayerAt(layerIndex),
            frameIndex,
            true
          );
    }
    function renderPngCanvas(a) {
      var indexes = exportFrameIndexes(a);
      var layerIndex = a.layer === undefined ? undefined : layer(a);
      var columns = integer(
        a.columns === undefined ? indexes.length : a.columns,
        1,
        indexes.length,
        "columns"
      );
      var rows = Math.ceil(indexes.length / columns);
      var scale = exportScale(a.scale);
      var frameWidth = Math.max(1, Math.round(c.getWidth() * scale));
      var frameHeight = Math.max(1, Math.round(c.getHeight() * scale));
      var outputWidth = frameWidth * columns;
      var outputHeight = frameHeight * rows;
      assert(
        outputWidth > 0 &&
          outputHeight > 0 &&
          outputWidth <= 32767 &&
          outputHeight <= 32767 &&
          outputWidth * outputHeight <= 100000000,
        "Export image too large"
      );
      var canvas = pskl.utils.CanvasUtils.createCanvas(
        outputWidth,
        outputHeight
      );
      var context = canvas.getContext("2d");
      indexes.forEach(function (frameIndex, index) {
        var source = renderFrameCanvas(frameIndex, layerIndex);
        if (source.width !== frameWidth || source.height !== frameHeight) {
          source = pskl.utils.ImageResizer.resize(
            source,
            frameWidth,
            frameHeight,
            !!a.smoothing
          );
        }
        context.drawImage(
          source,
          (index % columns) * frameWidth,
          Math.floor(index / columns) * frameHeight
        );
      });
      return {
        canvas: canvas,
        frames: indexes,
        columns: columns,
        rows: rows,
        frameWidth: frameWidth,
        frameHeight: frameHeight
      };
    }
    function createPixiExport(a) {
      var rendered = renderPngCanvas(a);
      var image = rendered.canvas.toDataURL("image/png");
      var name = text(a.name || c.getPiskel().getDescriptor().name, "name");
      var frames = {};
      rendered.frames.forEach(function (sourceIndex, index) {
        var column = index % rendered.columns;
        var row = Math.floor(index / rendered.columns);
        var frameData = {
          frame: {
            x: rendered.frameWidth * column,
            y: rendered.frameHeight * row,
            w: rendered.frameWidth,
            h: rendered.frameHeight
          },
          rotated: false,
          trimmed: false,
          spriteSourceSize: {
            x: 0,
            y: 0,
            w: rendered.frameWidth,
            h: rendered.frameHeight
          },
          sourceSize: { w: rendered.frameWidth, h: rendered.frameHeight },
          sourceFrame: sourceIndex
        };
        frames[name + sourceIndex + ".png"] = frameData;
      });
      return {
        image: image,
        json: {
          frames: frames,
          meta: {
            app: "https://github.com/piskelapp/piskel/",
            version: "2.0",
            image: a.inlineImage === false ? name + ".png" : image,
            format: "RGBA8888",
            size: { w: rendered.canvas.width, h: rendered.canvas.height },
            scale: String(exportScale(a.scale))
          }
        }
      };
    }
    function createCExport(a) {
      var rawName = text(a.name || c.getPiskel().getDescriptor().name, "name");
      var identifier = rawName.replace(/[^a-z0-9_]/gi, "_") || "sprite";
      if (/^[0-9]/.test(identifier)) {
        identifier = "sprite_" + identifier;
      }
      var safeCommentName = rawName
        .replace(/\*\//g, "* /")
        .replace(/[\r\n]+/g, " ");
      var upper = identifier.toUpperCase();
      var lower = identifier.toLowerCase();
      var width = c.getWidth();
      var height = c.getHeight();
      var indexes = exportFrameIndexes(a);
      var output = "#include <stdint.h>\n\n";
      output += "#define " + upper + "_FRAME_COUNT " + indexes.length + "\n";
      output += "#define " + upper + "_FRAME_WIDTH " + width + "\n";
      output += "#define " + upper + "_FRAME_HEIGHT " + height + "\n\n";
      output += '/* Piskel data for "' + safeCommentName + '" */\n\n';
      output +=
        "static const uint32_t " +
        lower +
        "_data[" +
        indexes.length +
        "][" +
        width * height +
        "] = {\n";
      indexes.forEach(function (frameIndex, framePosition) {
        var canvas = renderFrameCanvas(frameIndex);
        var pixels = canvas
          .getContext("2d")
          .getImageData(0, 0, width, height).data;
        output += "{\n";
        for (var i = 0; i < pixels.length; i += 4) {
          var value = "0x";
          value += ("00" + pixels[i + 3].toString(16)).slice(-2);
          value += ("00" + pixels[i + 2].toString(16)).slice(-2);
          value += ("00" + pixels[i + 1].toString(16)).slice(-2);
          value += ("00" + pixels[i].toString(16)).slice(-2);
          output += value + (i === pixels.length - 4 ? "" : ", ");
          if ((i + 4) % (width * 4) === 0) {
            output += "\n";
          }
        }
        output += framePosition === indexes.length - 1 ? "}\n" : "},\n";
      });
      return output + "};\n";
    }
    function safeFilePart(value, fallback) {
      var result = String(value || fallback)
        .replace(/[\\/:*?\"<>|]/g, "_")
        .trim();
      return result || fallback;
    }
    function createZipExport(a) {
      assert(window.JSZip, "ZIP export is not available");
      var zip = new window.JSZip();
      var indexes = exportFrameIndexes(a);
      var scale = exportScale(a.scale);
      var prefix = safeFilePart(
        a.prefix === undefined ? "sprite_" : a.prefix,
        "sprite_"
      );
      var splitLayers = !!a.splitLayers;
      var framePadding = String(Math.max.apply(Math, indexes) + 1).length;
      function addFrame(layerIndex, frameIndex) {
        var canvas = renderFrameCanvas(frameIndex, layerIndex);
        if (scale !== 1) {
          canvas = pskl.utils.ImageResizer.resize(
            canvas,
            Math.round(canvas.width * scale),
            Math.round(canvas.height * scale),
            !!a.smoothing
          );
        }
        var frameId = pskl.utils.StringUtils.leftPad(
          frameIndex + 1,
          framePadding,
          "0"
        );
        var filename = prefix + frameId + ".png";
        if (layerIndex !== undefined) {
          var layerName = a.useLayerNames
            ? safeFilePart(
                c.getLayerAt(layerIndex).getName(),
                "layer_" + layerIndex
              )
            : "l" +
              pskl.utils.StringUtils.leftPad(
                layerIndex,
                String(c.getLayers().length).length,
                "0"
              );
          filename = layerName + "_" + filename;
        }
        zip.file(
          filename,
          pskl.utils.CanvasUtils.getBase64FromCanvas(canvas) + "\n",
          {
            base64: true
          }
        );
      }
      if (splitLayers) {
        c.getLayers().forEach(function (_, layerIndex) {
          indexes.forEach(function (frameIndex) {
            addFrame(layerIndex, frameIndex);
          });
        });
      } else {
        indexes.forEach(function (frameIndex) {
          addFrame(undefined, frameIndex);
        });
      }
      return "data:application/zip;base64," + zip.generate({ type: "base64" });
    }
    function createGifExport(a) {
      assert(
        pskl.controller.settings.exportimage.GifExportController,
        "GIF export is not available"
      );
      var scale = integer(a.scale === undefined ? 1 : a.scale, 1, 32, "scale");
      var fps = integer(a.fps === undefined ? c.getFPS() : a.fps, 1, 60, "fps");
      var indexes = exportFrameIndexes(a);
      var layerIndex = a.layer === undefined ? undefined : layer(a);
      var outputWidth = c.getWidth() * scale;
      var outputHeight = c.getHeight() * scale;
      assert(
        outputWidth <= 32767 &&
          outputHeight <= 32767 &&
          outputWidth * outputHeight <= 100000000,
        "Export image too large"
      );
      var repeat =
        a.repeat === undefined
          ? !!(
              getUserSettings() &&
              getUserSettings().get(getUserSettings().EXPORT_GIF_REPEAT)
            )
          : !!a.repeat;
      var exportController = {
        getLayers: function () {
          return layerIndex === undefined
            ? c.getLayers()
            : [c.getLayerAt(layerIndex)];
        },
        getFrameCount: function () {
          return indexes.length;
        },
        getWidth: function () {
          return c.getWidth();
        },
        getHeight: function () {
          return c.getHeight();
        },
        renderFrameAt: function (index) {
          return renderFrameCanvas(indexes[index], layerIndex);
        }
      };
      var controller =
        new pskl.controller.settings.exportimage.GifExportController(
          exportController,
          {
            getExportZoom: function () {
              return scale;
            }
          }
        );
      controller.getRepeatSetting_ = function () {
        return repeat;
      };
      return new Promise(function (resolve, reject) {
        var settled = false;
        var timer = window.setTimeout(function () {
          if (!settled) {
            settled = true;
            $.publish(Events.HIDE_PROGRESS);
            reject(new Error("GIF export timed out"));
          }
        }, 60000);
        try {
          controller.renderAsImageDataAnimatedGIF(scale, fps, function (data) {
            if (!settled) {
              settled = true;
              window.clearTimeout(timer);
              resolve(data);
            }
          });
        } catch (error) {
          settled = true;
          window.clearTimeout(timer);
          reject(error);
        }
      });
    }
    function downloadData(data, mime, filename) {
      assert(
        typeof document !== "undefined",
        "Downloads require a browser document"
      );
      var url;
      var revoke = false;
      if (typeof data === "string" && /^data:/i.test(data)) {
        url = data;
      } else {
        var content =
          typeof data === "string" ? data : JSON.stringify(data, null, 2);
        url = URL.createObjectURL(new Blob([content], { type: mime }));
        revoke = true;
      }
      var link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.addEventListener("click", function (event) {
        event.stopPropagation();
      });
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (revoke) {
        window.setTimeout(function () {
          URL.revokeObjectURL(url);
        }, 1000);
      }
    }
    function exportFile(a) {
      var format = (a.format || "piskel").toLowerCase();
      if (format === "json") {
        format = "piskel";
      } else if (format === "spritesheet") {
        format = "png";
      }
      oneOf(format, ["piskel", "png", "gif", "zip", "pixi", "c"], "format");
      var result;
      if (format === "piskel") {
        result = c.serialize();
      } else if (format === "png") {
        result = renderPngCanvas(a).canvas.toDataURL("image/png");
      } else if (format === "zip") {
        result = createZipExport(a);
      } else if (format === "pixi") {
        result = createPixiExport(a);
      } else if (format === "c") {
        result = createCExport(a);
      } else {
        result = createGifExport(a);
      }
      return Promise.resolve(result).then(function (data) {
        if (a.download) {
          var base = safeFilePart(
            a.name || c.getPiskel().getDescriptor().name,
            "sprite"
          );
          var extension = format === "pixi" ? "json" : format;
          var mime = {
            piskel: "application/json",
            png: "image/png",
            gif: "image/gif",
            zip: "application/zip",
            pixi: "application/json",
            c: "text/x-c"
          }[format];
          if (format === "pixi" && a.inlineImage === false) {
            downloadData(data.image, "image/png", base + ".png");
          }
          downloadData(
            format === "pixi" ? data.json : data,
            mime,
            base + "." + extension
          );
        }
        return data;
      });
    }
    function importPiskelData(raw) {
      if (typeof raw === "string") {
        assert(raw.length <= 64 * 1024 * 1024, "Piskel data is too large");
      }
      var data = typeof raw === "string" ? JSON.parse(raw) : clone(raw);
      if (typeof raw !== "string") {
        assert(
          JSON.stringify(data).length <= 64 * 1024 * 1024,
          "Piskel data is too large"
        );
      }
      assert(
        data && data.modelVersion === Constants.MODEL_VERSION && data.piskel,
        "Expected current-version .piskel data"
      );
      var serializedPiskel = data.piskel;
      integer(serializedPiskel.width, 1, MAX_DIMENSION, "width");
      integer(serializedPiskel.height, 1, MAX_DIMENSION, "height");
      assert(
        Array.isArray(serializedPiskel.layers) &&
          serializedPiskel.layers.length > 0,
        "layers must not be empty"
      );
      integer(serializedPiskel.layers.length, 1, MAX_LAYERS, "layer count");
      var count;
      serializedPiskel.layers.forEach(function (encoded) {
        assert(typeof encoded === "string", "layer must be encoded JSON");
        var layerData = JSON.parse(encoded);
        integer(layerData.frameCount, 1, MAX_FRAMES, "frameCount");
        count = count || layerData.frameCount;
        assert(
          layerData.frameCount === count,
          "All layers must have equal frame counts"
        );
        var layoutIndexes = Object.create(null);
        assert(
          Array.isArray(layerData.chunks) &&
            layerData.chunks.length > 0 &&
            layerData.chunks.length <= layerData.frameCount &&
            layerData.chunks.every(function (chunk) {
              return (
                typeof chunk.base64PNG === "string" &&
                chunk.base64PNG.startsWith("data:image/png;base64,") &&
                Array.isArray(chunk.layout) &&
                chunk.layout.length > 0 &&
                chunk.layout.every(function (entry) {
                  if (
                    !Array.isArray(entry) ||
                    !Number.isInteger(entry[0]) ||
                    entry[0] < 0 ||
                    entry[0] >= layerData.frameCount ||
                    layoutIndexes[entry[0]]
                  ) {
                    return false;
                  }
                  layoutIndexes[entry[0]] = true;
                  return true;
                })
              );
            }) &&
            Object.keys(layoutIndexes).length === layerData.frameCount,
          "Expected embedded PNG chunks with one layout entry per frame"
        );
      });
      checkCapacity(
        serializedPiskel.width,
        serializedPiskel.height,
        serializedPiskel.layers.length,
        count
      );
      return new Promise(function (resolve, reject) {
        var active = true;
        var timer = window.setTimeout(function () {
          active = false;
          reject(new Error("Import timed out"));
        }, 15000);
        pskl.utils.serialization.Deserializer.deserialize(
          data,
          function (loaded) {
            if (!active) {
              return;
            }
            active = false;
            window.clearTimeout(timer);
            try {
              assert(
                loaded.getFrameCount() === count,
                "Decoded frame count does not match"
              );
              loaded.getLayers().forEach(function (loadedLayer) {
                assert(
                  loadedLayer.size() === count,
                  "Decoded layers have different frame counts"
                );
                loadedLayer.getFrames().forEach(function (loadedFrame) {
                  assert(
                    loadedFrame &&
                      loadedFrame.getWidth() === serializedPiskel.width &&
                      loadedFrame.getHeight() === serializedPiskel.height,
                    "Decoded frame dimensions do not match"
                  );
                });
              });
              pub.setPiskel(loaded);
              resolve(state());
            } catch (error) {
              reject(error);
            }
          },
          function (error) {
            if (!active) {
              return;
            }
            active = false;
            window.clearTimeout(timer);
            reject(new Error(String(error)));
          }
        );
      });
    }
    function importImageData(a) {
      assert(
        typeof a.data === "string" &&
          /^data:image\/(?:png|gif|jpe?g|webp|bmp|x-ms-bmp);base64,/i.test(
            a.data
          ),
        "data must be a base64 PNG, GIF, JPEG, WebP or BMP data URL"
      );
      assert(a.data.length <= 64 * 1024 * 1024, "Image data is too large");
      var mode = oneOf(a.mode || "single", ["single", "spritesheet"], "mode");
      if (a.name !== undefined) {
        text(a.name, "name");
      }
      if (a.smoothing !== undefined) {
        assert(typeof a.smoothing === "boolean", "smoothing must be boolean");
      }
      return new Promise(function (resolve, reject) {
        var image = new Image();
        var active = true;
        var timer = window.setTimeout(function () {
          active = false;
          reject(new Error("Image import timed out"));
        }, 30000);
        image.onerror = function () {
          if (active) {
            active = false;
            window.clearTimeout(timer);
            reject(new Error("Could not decode image"));
          }
        };
        image.onload = function () {
          if (!active) {
            return;
          }
          try {
            var frameWidth = integer(
              a.frameWidth === undefined
                ? image.naturalWidth || image.width
                : a.frameWidth,
              1,
              MAX_DIMENSION,
              "frameWidth"
            );
            var frameHeight = integer(
              a.frameHeight === undefined
                ? image.naturalHeight || image.height
                : a.frameHeight,
              1,
              MAX_DIMENSION,
              "frameHeight"
            );
            var offsetX = integer(
              a.offsetX === undefined ? 0 : a.offsetX,
              0,
              image.width,
              "offsetX"
            );
            var offsetY = integer(
              a.offsetY === undefined ? 0 : a.offsetY,
              0,
              image.height,
              "offsetY"
            );
            var estimatedFrames =
              mode === "spritesheet"
                ? Math.floor((image.width - offsetX) / frameWidth) *
                  Math.floor((image.height - offsetY) / frameHeight)
                : 1;
            assert(
              estimatedFrames > 0,
              "Spritesheet contains no complete frame"
            );
            checkCapacity(frameWidth, frameHeight, 1, estimatedFrames);
            var options = {
              importType: mode,
              name: a.name || "Imported piskel",
              smoothing: !!a.smoothing,
              frameSizeX: frameWidth,
              frameSizeY: frameHeight,
              frameOffsetX: offsetX,
              frameOffsetY: offsetY
            };
            app.importService.newPiskelFromImage(
              image,
              options,
              function (loaded) {
                if (!active) {
                  return;
                }
                try {
                  assert(
                    loaded && loaded.getLayers().length > 0,
                    "Image produced no frames"
                  );
                  checkCapacity(
                    loaded.getWidth(),
                    loaded.getHeight(),
                    loaded.getLayers().length,
                    loaded.getFrameCount()
                  );
                  active = false;
                  window.clearTimeout(timer);
                  pub.setPiskel(loaded);
                  resolve(state());
                } catch (error) {
                  active = false;
                  window.clearTimeout(timer);
                  reject(error);
                }
              }
            );
          } catch (error) {
            active = false;
            window.clearTimeout(timer);
            reject(error);
          }
        };
        image.src = a.data;
      });
    }

    register(
      "file.state",
      "{includeSerialized=false,includePixels=false,pixelFormat='uint32'}",
      "Read current file identity, dirty/save status and optional exact contents.",
      function (a) {
        var result = fileState(!!a.includeSerialized);
        if (a.includePixels) {
          result.document = readDocument({
            pixels: a.includePixels === true ? "all" : a.includePixels,
            format: a.pixelFormat || "uint32"
          });
        }
        return result;
      }
    );
    register(
      "file.read",
      "{includeSerialized=true,includePixels=false,pixelFormat='uint32'}",
      "Read a restorable representation of the file currently open in the editor.",
      function (a) {
        return commands["file.state"].run(
          Object.assign({}, a, {
            includeSerialized: a.includeSerialized !== false
          })
        );
      }
    );
    register(
      "file.export",
      "{format='piskel'|'png'|'gif'|'zip'|'pixi'|'c',download=false,name?,scale?,frame?,frames?,columns?,layer?,visibleOnly?,splitLayers?}",
      "Export every image/file format available in the app; binary formats return data URLs.",
      exportFile
    );
    register(
      "file.import",
      "{data:string|object,mode?,frameWidth?,frameHeight?,offsetX?,offsetY?,smoothing?}",
      "Import current-version .piskel JSON or a base64 image data URL.",
      function (a) {
        if (typeof a.data === "string" && /^data:image\//i.test(a.data)) {
          return importImageData(a);
        }
        return importPiskelData(a.data);
      },
      { mutates: true }
    );
    register(
      "file.importImage",
      "{data:dataURL,mode='single'|'spritesheet',name?,frameWidth?,frameHeight?,offsetX=0,offsetY=0,smoothing=false}",
      "Import PNG/JPEG/BMP/WebP, animated GIF or a spritesheet without opening a dialog.",
      importImageData,
      { mutates: true }
    );
    register(
      "layer.list",
      "{}",
      "List all layers from bottom to top and identify the selected layer.",
      function () {
        var summary = documentSummary();
        return {
          current: summary.currentLayer,
          count: summary.layerCount,
          layers: summary.layers
        };
      }
    );
    register(
      "layer.read",
      "{layer?,pixels='all'|'current'|'none',format='rows'|'flat'|'sparse'|'uint32'}",
      "Read one layer, including any requested frame pixels.",
      function (a) {
        var index = layer(a);
        var pixelScope = a.pixels === undefined ? "all" : a.pixels;
        if (pixelScope === true) {
          pixelScope = "all";
        } else if (pixelScope === false) {
          pixelScope = "none";
        }
        oneOf(pixelScope, ["all", "current", "none"], "pixels");
        var format = oneOf(
          a.format || "rows",
          ["rows", "flat", "sparse", "uint32"],
          "format"
        );
        var item = c.getLayerAt(index);
        return {
          index: index,
          name: item.getName(),
          opacity: item.getOpacity(),
          frames: item.getFrames().map(function (target, frameIndex) {
            var result = {
              index: frameIndex,
              hidden: c.getPiskel().hiddenFrames.indexOf(frameIndex) !== -1,
              hash: target.getHash()
            };
            if (
              pixelScope === "all" ||
              (pixelScope === "current" &&
                frameIndex === c.getCurrentFrameIndex())
            ) {
              result.pixels = readFramePixels(target, format);
            }
            return result;
          })
        };
      }
    );
    register(
      "layer.select",
      "{layer}",
      "Select zero-based layer.",
      function (a) {
        pub.setCurrentLayerIndex(layer(a));
        return state();
      }
    );
    register(
      "layer.add",
      "{name?}",
      "Create and select a layer with matching frame count.",
      function (a) {
        if (a.name !== undefined) {
          text(a.name, "name");
        }
        capacity(c.getLayers().length + 1, c.getFrameCount());
        pub.createLayer(a.name);
        return state();
      }
    );
    register(
      "layer.update",
      "{layer?,name?,opacity?}",
      "Rename layer or set opacity 0..1.",
      function (a) {
        var i = layer(a);
        if (a.name !== undefined) {
          text(a.name, "name");
        }
        if (a.opacity !== undefined) {
          assert(
            Number.isFinite(a.opacity) && a.opacity >= 0 && a.opacity <= 1,
            "opacity must be 0..1"
          );
        }
        if (a.name !== undefined) {
          c.renameLayerAt(i, a.name);
        }
        if (a.opacity !== undefined) {
          c.setLayerOpacityAt(i, a.opacity);
        }
        snapshot();
        return state();
      }
    );
    ["remove", "duplicate", "mergeDown", "up", "down"].forEach(
      function (action) {
        register(
          "layer." + action,
          "{layer?,toEdge=false}",
          "Apply " + action + " to layer; selects target.",
          function (a) {
            var i = layer(a);
            if (action === "remove") {
              assert(c.getLayers().length > 1, "Cannot remove the last layer");
            }
            if (action === "mergeDown") {
              assert(i > 0, "Bottom layer cannot merge down");
            }
            if (action === "duplicate") {
              capacity(c.getLayers().length + 1, c.getFrameCount());
            }
            c.setCurrentLayerIndex(i);
            var methods = {
              remove: "removeCurrentLayer",
              duplicate: "duplicateCurrentLayer",
              mergeDown: "mergeDownLayerAt",
              up: "moveLayerUp",
              down: "moveLayerDown"
            };
            var methodArg =
              action === "mergeDown"
                ? i
                : action === "up" || action === "down"
                  ? !!a.toEdge
                  : undefined;
            c[methods[action]](methodArg);
            snapshot();
            return state();
          }
        );
      }
    );
    register(
      "layer.move",
      "{from?,to}",
      "Move a layer to any zero-based position and select it.",
      function (a) {
        var from = layer({ layer: a.from });
        var to = integer(a.to, 0, c.getLayers().length - 1, "to");
        c.setCurrentLayerIndex(from);
        while (c.getCurrentLayerIndex() < to) {
          c.moveLayerUp(false);
        }
        while (c.getCurrentLayerIndex() > to) {
          c.moveLayerDown(false);
        }
        snapshot();
        return state();
      },
      { mutates: true }
    );
    register(
      "frame.select",
      "{frame}",
      "Select zero-based frame.",
      function (a) {
        pub.setCurrentFrameIndex(frame(a));
        return state();
      }
    );
    register(
      "frame.add",
      "{index?}",
      "Insert blank frame across all layers; default append.",
      function (a) {
        capacity(c.getLayers().length, c.getFrameCount() + 1);
        pub.addFrameAt(
          integer(
            a.index === undefined ? c.getFrameCount() : a.index,
            0,
            c.getFrameCount(),
            "index"
          )
        );
        return state();
      }
    );
    ["remove", "duplicate", "toggleVisibility"].forEach(function (action) {
      register(
        "frame." + action,
        "{frame?}",
        "Apply " + action + " across all layers.",
        function (a) {
          var i = frame(a);
          if (action === "remove") {
            assert(c.getFrameCount() > 1, "Cannot remove the last frame");
          }
          if (action === "duplicate") {
            capacity(c.getLayers().length, c.getFrameCount() + 1);
          }
          if (action === "remove") {
            c.getPiskel().hiddenFrames = c
              .getPiskel()
              .hiddenFrames.filter(function (index) {
                return index !== i;
              });
            c.removeFrameAt(i);
            snapshot();
            return state();
          }
          pub[
            {
              remove: "removeFrameAt",
              duplicate: "duplicateFrameAt",
              toggleVisibility: "toggleFrameVisibilityAt"
            }[action]
          ](i);
          return state();
        }
      );
    });
    register(
      "frame.move",
      "{from,to}",
      "Reorder frame across layers.",
      function (a) {
        var from = frame({ frame: a.from });
        var to = frame({ frame: a.to });
        // Preserve hidden status explicitly (legacy controller loses unaffected indexes).
        var hidden = c.getPiskel().hiddenFrames.slice();
        c.moveFrame(from, to);
        c.getPiskel().hiddenFrames = hidden.map(function (i) {
          if (i === from) {
            return to;
          }
          if (from < to && i > from && i <= to) {
            return i - 1;
          }
          if (from > to && i >= to && i < from) {
            return i + 1;
          }
          return i;
        });
        c.setCurrentFrameIndex(to);
        snapshot();
        return state();
      }
    );
    register(
      "frame.list",
      "{}",
      "List frame indexes, visibility and per-layer hashes.",
      function () {
        var hidden = c.getPiskel().hiddenFrames;
        var frames = [];
        for (var i = 0; i < c.getFrameCount(); i++) {
          frames.push({
            index: i,
            hidden: hidden.indexOf(i) !== -1,
            selected: i === c.getCurrentFrameIndex(),
            layerHashes: c.getLayers().map(function (item) {
              return item.getFrameAt(i).getHash();
            })
          });
        }
        return {
          current: c.getCurrentFrameIndex(),
          count: frames.length,
          frames: frames
        };
      }
    );
    register(
      "frame.read",
      "{layer?,frame?,merged=false,format='rows'|'flat'|'sparse'|'uint32'}",
      "Read exact pixels for one layer frame or the composited frame.",
      function (a) {
        var frameIndex = frame(a);
        var format = a.format || "rows";
        if (a.merged !== undefined) {
          assert(typeof a.merged === "boolean", "merged must be boolean");
        }
        var target;
        if (a.merged) {
          var canvas = c.renderFrameAt(frameIndex, true);
          target = pskl.utils.FrameUtils.createFromCanvas(
            canvas,
            0,
            0,
            c.getWidth(),
            c.getHeight(),
            true
          );
        } else {
          target = c.getLayerAt(layer(a)).getFrameAt(frameIndex);
        }
        return readFramePixels(target, format);
      }
    );
    register(
      "frame.write",
      "{pixels,format?,layer?,frame?,clear=true}",
      "Atomically replace or patch a frame from rows, flat, sparse or uint32 pixels.",
      function (a) {
        var layerIndex = layer(a);
        var frameIndex = frame(a);
        if (a.clear !== undefined) {
          assert(typeof a.clear === "boolean", "clear must be boolean");
        }
        var target = c.getLayerAt(layerIndex).getFrameAt(frameIndex);
        var next = writeFramePixels(
          target,
          a.pixels,
          a.format,
          a.clear !== false
        );
        target.setPixels(next.getPixels());
        snapshot();
        return state();
      },
      { mutates: true }
    );
    register(
      "frame.setVisibility",
      "{frame?,visible}",
      "Set frame preview visibility idempotently.",
      function (a) {
        assert(typeof a.visible === "boolean", "visible must be boolean");
        var index = frame(a);
        var currentlyVisible = c.getPiskel().hiddenFrames.indexOf(index) === -1;
        if (currentlyVisible !== a.visible) {
          pub.toggleFrameVisibilityAt(index);
        }
        return state();
      },
      { mutates: true }
    );

    function draw(a, fn) {
      var f = c.getLayerAt(layer(a)).getFrameAt(frame(a));
      var copy = f.clone();
      fn(copy);
      f.setPixels(copy.getPixels());
      snapshot();
      return state();
    }
    function point(f, x, y) {
      integer(x, 0, f.getWidth() - 1, "x");
      integer(y, 0, f.getHeight() - 1, "y");
    }
    register(
      "draw.pixels",
      "{pixels:[{x,y,color}],layer?,frame?}",
      "Atomic pixel batch, one undo step. transparent erases.",
      function (a) {
        assert(
          Array.isArray(a.pixels) && a.pixels.length <= 1000000,
          "pixels must be an array of at most 1000000 entries"
        );
        return draw(a, function (f) {
          a.pixels.forEach(function (p) {
            object(p, "pixel");
            point(f, p.x, p.y);
            f.setPixel(p.x, p.y, color(p.color));
          });
        });
      }
    );
    register(
      "draw.clear",
      "{color='transparent',layer?,frame?}",
      "Fill entire target frame with a color.",
      function (a) {
        var value = color(a.color === undefined ? "transparent" : a.color);
        return draw(a, function (f) {
          f.forEachPixel(function (_, x, y) {
            f.setPixel(x, y, value);
          });
        });
      }
    );
    register(
      "draw.line",
      "{x1,y1,x2,y2,color,layer?,frame?}",
      "Draw a one-pixel Bresenham line.",
      function (a) {
        var value = color(a.color);
        return draw(a, function (f) {
          point(f, a.x1, a.y1);
          point(f, a.x2, a.y2);
          var x = a.x1;
          var y = a.y1;
          var dx = Math.abs(a.x2 - x);
          var dy = -Math.abs(a.y2 - y);
          var sx = x < a.x2 ? 1 : -1;
          var sy = y < a.y2 ? 1 : -1;
          var err = dx + dy;
          while (true) {
            f.setPixel(x, y, value);
            if (x === a.x2 && y === a.y2) {
              break;
            }
            var e = 2 * err;
            if (e >= dy) {
              err += dy;
              x += sx;
            }
            if (e <= dx) {
              err += dx;
              y += sy;
            }
          }
        });
      }
    );
    ["rect", "ellipse"].forEach(function (shape) {
      register(
        "draw." + shape,
        "{x,y,width,height,color,fill=false,layer?,frame?}",
        "Draw inside an inclusive pixel bounding box.",
        function (a) {
          if (a.fill !== undefined) {
            assert(typeof a.fill === "boolean", "fill must be boolean");
          }
          var value = color(a.color);
          return draw(a, function (f) {
            integer(a.width, 1, f.getWidth(), "width");
            integer(a.height, 1, f.getHeight(), "height");
            point(f, a.x, a.y);
            point(f, a.x + a.width - 1, a.y + a.height - 1);
            function inside(x, y) {
              if (x < 0 || y < 0 || x >= a.width || y >= a.height) {
                return false;
              }
              if (shape === "rect") {
                return true;
              }
              return (
                Math.pow((x + 0.5 - a.width / 2) / (a.width / 2), 2) +
                  Math.pow((y + 0.5 - a.height / 2) / (a.height / 2), 2) <=
                1
              );
            }
            for (var y = 0; y < a.height; y++) {
              for (var x = 0; x < a.width; x++) {
                if (
                  inside(x, y) &&
                  (a.fill ||
                    !inside(x - 1, y) ||
                    !inside(x + 1, y) ||
                    !inside(x, y - 1) ||
                    !inside(x, y + 1))
                ) {
                  f.setPixel(a.x + x, a.y + y, value);
                }
              }
            }
          });
        }
      );
    });
    register(
      "draw.fill",
      "{x,y,color,layer?,frame?}",
      "Flood-fill four-connected pixels of identical color.",
      function (a) {
        var value = color(a.color);
        return draw(a, function (f) {
          point(f, a.x, a.y);
          var old = f.getPixel(a.x, a.y);
          var replacement = pskl.utils.colorToInt(value);
          if (old === replacement) {
            return;
          }
          var stack = [[a.x, a.y]];
          f.setPixel(a.x, a.y, value);
          while (stack.length) {
            var p = stack.pop();
            [
              [p[0] - 1, p[1]],
              [p[0] + 1, p[1]],
              [p[0], p[1] - 1],
              [p[0], p[1] + 1]
            ].forEach(function (n) {
              if (
                f.containsPixel(n[0], n[1]) &&
                f.getPixel(n[0], n[1]) === old
              ) {
                f.setPixel(n[0], n[1], value);
                stack.push(n);
              }
            });
          }
        });
      }
    );

    register(
      "draw.replaceColor",
      "{from,to,scope='frame'|'layer'|'document',layer?,frame?}",
      "Replace an exact color in the selected frame, layer or whole document as one undo step.",
      function (a) {
        var from = pskl.utils.colorToInt(pixelValue(a.from));
        var to = pixelValue(a.to);
        var scope = oneOf(
          a.scope || "frame",
          ["frame", "layer", "document"],
          "scope"
        );
        var layerIndex = layer(a);
        var frameIndex = frame(a);
        var targets = [];
        c.getLayers().forEach(function (item, currentLayer) {
          item.getFrames().forEach(function (target, currentFrame) {
            if (
              scope === "document" ||
              (scope === "layer" && currentLayer === layerIndex) ||
              (scope === "frame" &&
                currentLayer === layerIndex &&
                currentFrame === frameIndex)
            ) {
              targets.push({ target: target, copy: target.clone() });
            }
          });
        });
        var changed = 0;
        targets.forEach(function (entry) {
          entry.copy.forEachPixel(function (value, x, y) {
            if (value === from) {
              entry.copy.setPixel(x, y, to);
              changed++;
            }
          });
        });
        targets.forEach(function (entry) {
          entry.target.setPixels(entry.copy.getPixels());
        });
        if (changed) {
          snapshot();
        }
        return { changed: changed, state: state() };
      },
      { mutates: true }
    );
    register(
      "draw.image",
      "{data:dataURL,x=0,y=0,width?,height?,smoothing=false,replaceFrame=false,layer?,frame?}",
      "Composite a base64 image into any frame and preserve alpha.",
      function (a) {
        assert(
          typeof a.data === "string" &&
            /^data:image\/(?:png|gif|jpe?g|webp|bmp|x-ms-bmp);base64,/i.test(
              a.data
            ),
          "data must be a base64 image data URL"
        );
        assert(a.data.length <= 64 * 1024 * 1024, "Image data is too large");
        if (a.smoothing !== undefined) {
          assert(typeof a.smoothing === "boolean", "smoothing must be boolean");
        }
        if (a.replaceFrame !== undefined) {
          assert(
            typeof a.replaceFrame === "boolean",
            "replaceFrame must be boolean"
          );
        }
        var layerIndex = layer(a);
        var frameIndex = frame(a);
        var target = c.getLayerAt(layerIndex).getFrameAt(frameIndex);
        return new Promise(function (resolve, reject) {
          var image = new Image();
          var active = true;
          var timer = window.setTimeout(function () {
            active = false;
            reject(new Error("Image decode timed out"));
          }, 15000);
          image.onerror = function () {
            if (active) {
              active = false;
              window.clearTimeout(timer);
              reject(new Error("Could not decode image"));
            }
          };
          image.onload = function () {
            if (!active) {
              return;
            }
            active = false;
            window.clearTimeout(timer);
            try {
              var x = integer(
                a.x === undefined ? 0 : a.x,
                0,
                target.getWidth() - 1,
                "x"
              );
              var y = integer(
                a.y === undefined ? 0 : a.y,
                0,
                target.getHeight() - 1,
                "y"
              );
              var width = integer(
                a.width === undefined ? image.width : a.width,
                1,
                target.getWidth(),
                "width"
              );
              var height = integer(
                a.height === undefined ? image.height : a.height,
                1,
                target.getHeight(),
                "height"
              );
              assert(
                x + width <= target.getWidth() &&
                  y + height <= target.getHeight(),
                "image must fit inside frame"
              );
              var canvas = pskl.utils.CanvasUtils.createCanvas(
                target.getWidth(),
                target.getHeight()
              );
              var context = canvas.getContext("2d");
              if (!a.replaceFrame) {
                context.drawImage(pskl.utils.FrameUtils.toImage(target), 0, 0);
              }
              context.imageSmoothingEnabled = !!a.smoothing;
              context.drawImage(image, x, y, width, height);
              var next = pskl.utils.FrameUtils.createFromCanvas(
                canvas,
                0,
                0,
                target.getWidth(),
                target.getHeight(),
                true
              );
              target.setPixels(next.getPixels());
              snapshot();
              resolve(state());
            } catch (error) {
              reject(error);
            }
          };
          image.src = a.data;
        });
      },
      { mutates: true }
    );

    function listPalettes() {
      assert(app.paletteService, "Palette service is not available");
      var dynamic = app.paletteService.dynamicPalettes || [];
      var selectedId = getUserSettings()
        ? getUserSettings().get(getUserSettings().SELECTED_PALETTE)
        : null;
      return app.paletteService.getPalettes().map(function (palette) {
        return {
          id: palette.id,
          name: palette.name,
          colors: palette.getColors().slice(),
          readOnly: dynamic.indexOf(palette) !== -1,
          selected: palette.id === selectedId
        };
      });
    }
    function getPalette(id) {
      text(id, "id");
      var palette = listPalettes().filter(function (item) {
        return item.id === id;
      })[0];
      assert(palette, "Unknown palette");
      return palette;
    }

    register(
      "palette.list",
      "{}",
      "List stored and dynamic palettes.",
      listPalettes
    );
    register(
      "palette.state",
      "{}",
      "Read the selected palette and all palette colors.",
      function () {
        var palettes = listPalettes();
        return {
          selectedId: getUserSettings().get(getUserSettings().SELECTED_PALETTE),
          selected:
            palettes.filter(function (item) {
              return item.selected;
            })[0] || null,
          palettes: palettes
        };
      }
    );
    register("palette.get", "{id}", "Read one palette.", function (a) {
      return getPalette(a.id);
    });
    register(
      "palette.save",
      "{id?,name,colors:[#RRGGBB]}",
      "Create or replace a local palette (not document undo history).",
      function (a) {
        text(a.name, "name");
        assert(
          Array.isArray(a.colors) &&
            a.colors.length > 0 &&
            a.colors.length <= 4096,
          "colors must contain 1..4096 colors"
        );
        var colors = a.colors.map(color);
        var id =
          a.id === undefined ? pskl.utils.Uuid.generate() : text(a.id, "id");
        var existing = app.paletteService.getPaletteById(id);
        assert(
          !existing ||
            (app.paletteService.dynamicPalettes || []).indexOf(existing) === -1,
          "Dynamic palette is read-only"
        );
        app.paletteService.savePalette(
          new pskl.model.Palette(id, a.name, colors)
        );
        return getPalette(id);
      },
      { mutates: true }
    );
    register(
      "palette.import",
      "{name,id?,data:string|{colors},format='auto'|'json'|'gpl'|'hex'}",
      "Import JSON, GPL or plain hex palette text.",
      function (a) {
        var colors;
        var name = a.name;
        var format = oneOf(
          a.format || "auto",
          ["auto", "json", "gpl", "hex"],
          "format"
        );
        var data = a.data;
        if (data && typeof data === "object") {
          object(data, "data");
          colors = data.colors;
          name = name || data.name;
        } else {
          assert(typeof data === "string", "data must be text or an object");
          if (format === "auto") {
            format = /^\s*\{/.test(data)
              ? "json"
              : /^\s*GIMP Palette/im.test(data)
                ? "gpl"
                : "hex";
          }
          if (format === "json") {
            var parsed = JSON.parse(data);
            object(parsed, "data");
            colors = parsed.colors;
            name = name || parsed.name;
          } else if (format === "gpl") {
            colors = [];
            data.split(/\r?\n/).forEach(function (line) {
              var match = line.match(
                /^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(?:\s|$)/
              );
              if (match) {
                var rgb = match.slice(1, 4).map(function (part) {
                  return integer(parseInt(part, 10), 0, 255, "GPL color");
                });
                colors.push(
                  "#" +
                    rgb
                      .map(function (part) {
                        return ("0" + part.toString(16)).slice(-2);
                      })
                      .join("")
                );
              }
            });
            if (!name) {
              var nameMatch = data.match(/^Name:\s*(.+)$/im);
              name = nameMatch && nameMatch[1].trim();
            }
          } else {
            colors = [];
            data.split(/\r?\n|\s*,\s*/).forEach(function (line) {
              var match = line.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
              if (match) {
                var value = match[1];
                if (value.length === 3) {
                  value =
                    value[0] +
                    value[0] +
                    value[1] +
                    value[1] +
                    value[2] +
                    value[2];
                }
                colors.push("#" + value);
              }
            });
          }
        }
        return commands["palette.save"].run({
          id: a.id,
          name: name || "Imported palette",
          colors: colors
        });
      },
      { mutates: true }
    );
    register(
      "palette.export",
      "{id,format='json'|'gpl'|'hex',download=false,name?}",
      "Export a palette as JSON, GIMP GPL or newline-separated hex colors.",
      function (a) {
        var palette = getPalette(a.id);
        var format = oneOf(
          a.format || "json",
          ["json", "gpl", "hex"],
          "format"
        );
        var output;
        if (format === "json") {
          output = JSON.stringify(
            { name: palette.name, colors: palette.colors },
            null,
            2
          );
        } else if (format === "gpl") {
          output = "GIMP Palette\nName: " + palette.name + "\nColumns: 0\n#\n";
          palette.colors.forEach(function (item) {
            var rgb = window.tinycolor(item).toRgb();
            output += rgb.r + " " + rgb.g + " " + rgb.b + "\t" + item + "\n";
          });
        } else {
          output = palette.colors.join("\n") + "\n";
        }
        if (a.download) {
          downloadData(
            output,
            format === "json" ? "application/json" : "text/plain",
            safeFilePart(a.name || palette.name, "palette") + "." + format
          );
        }
        return output;
      }
    );
    register(
      "palette.select",
      "{id}",
      "Select a palette in the UI.",
      function (a) {
        getPalette(a.id);
        getUserSettings().set(getUserSettings().SELECTED_PALETTE, a.id);
        var selected = getPalette(a.id);
        emitEvent("palette", { selectedId: a.id });
        return selected;
      },
      { mutates: true }
    );
    register(
      "palette.remove",
      "{id}",
      "Delete a stored palette.",
      function (a) {
        var palette = getPalette(a.id);
        assert(!palette.readOnly, "Dynamic palette is read-only");
        app.paletteService.deletePaletteById(a.id);
        if (palette.selected && getUserSettings()) {
          getUserSettings().set(
            getUserSettings().SELECTED_PALETTE,
            Constants.CURRENT_COLORS_PALETTE_ID
          );
        }
        return { id: a.id };
      },
      { mutates: true }
    );

    function selectToolColor(target, value) {
      var isPrimary = target === "primary";
      var event = app.paletteController
        ? isPrimary
          ? Events.SELECT_PRIMARY_COLOR
          : Events.SELECT_SECONDARY_COLOR
        : isPrimary
          ? Events.PRIMARY_COLOR_SELECTED
          : Events.SECONDARY_COLOR_SELECTED;
      $.publish(event, [value]);
    }

    register(
      "tool.list",
      "{}",
      "Discover all drawing tools and transformations, including descriptions and shortcuts.",
      function () {
        function describe(item) {
          return {
            id: item.toolId,
            description: item.helpText || null,
            shortcut:
              item.shortcut && item.shortcut.getKeys
                ? item.shortcut.getKeys().slice()
                : []
          };
        }
        return {
          selected: app.toolController.currentSelectedTool.toolId,
          drawing: app.toolController.tools.map(function (item) {
            return item.toolId;
          }),
          transforms: app.transformationsController.tools.map(function (item) {
            return item.toolId;
          }),
          drawingDetails: app.toolController.tools.map(describe),
          transformDetails: app.transformationsController.tools.map(describe)
        };
      }
    );
    register(
      "tool.state",
      "{}",
      "Read selected tool, colors and pen size.",
      function () {
        return {
          id: app.toolController.currentSelectedTool.toolId,
          primaryColor: app.selectedColorsService.getPrimaryColor(),
          secondaryColor: app.selectedColorsService.getSecondaryColor(),
          penSize: app.penSizeService.getPenSize()
        };
      }
    );
    register(
      "tool.select",
      "{id}",
      "Select an existing drawing tool in the UI.",
      function (a) {
        assert(
          app.toolController.tools.some(function (item) {
            return item.toolId === a.id;
          }),
          "Unknown tool"
        );
        $.publish(Events.SELECT_TOOL, [a.id]);
        return state();
      },
      { mutates: true }
    );
    register(
      "tool.colors",
      "{primary?,secondary?}",
      "Set primary and/or secondary drawing colors.",
      function (a) {
        var primary = a.primary === undefined ? undefined : color(a.primary);
        var secondary =
          a.secondary === undefined ? undefined : color(a.secondary);
        assert(
          primary !== undefined || secondary !== undefined,
          "Provide primary or secondary"
        );
        if (primary !== undefined) {
          selectToolColor("primary", primary);
        }
        if (secondary !== undefined) {
          selectToolColor("secondary", secondary);
        }
        return state();
      },
      { mutates: true }
    );
    register(
      "tool.swapColors",
      "{}",
      "Swap primary and secondary colors.",
      function () {
        if (app.paletteController && app.paletteController.swapColors) {
          app.paletteController.swapColors();
        } else {
          var primary = app.selectedColorsService.getPrimaryColor();
          var secondary = app.selectedColorsService.getSecondaryColor();
          selectToolColor("primary", secondary);
          selectToolColor("secondary", primary);
        }
        return state();
      },
      { mutates: true }
    );
    register(
      "tool.resetColors",
      "{}",
      "Reset drawing colors to app defaults.",
      function () {
        if (app.paletteController && app.paletteController.resetColors) {
          app.paletteController.resetColors();
        } else {
          selectToolColor("primary", Constants.DEFAULT_PEN_COLOR);
          selectToolColor("secondary", Constants.TRANSPARENT_COLOR);
        }
        return state();
      },
      { mutates: true }
    );
    register(
      "tool.pick",
      "{x,y,target='primary'|'secondary',layer?,frame?}",
      "Pick a layer pixel into the primary or secondary tool color.",
      function (a) {
        var targetFrame = c.getLayerAt(layer(a)).getFrameAt(frame(a));
        point(targetFrame, a.x, a.y);
        var picked = pskl.utils.intToColor(targetFrame.getPixel(a.x, a.y));
        var target = oneOf(
          a.target || "primary",
          ["primary", "secondary"],
          "target"
        );
        selectToolColor(target, picked);
        return { color: picked, target: target, state: state() };
      },
      { mutates: true }
    );
    register(
      "tool.penSize",
      "{size}",
      "Set pen size 1..32.",
      function (a) {
        app.penSizeService.setPenSize(integer(a.size, 1, 32, "size"));
        return state();
      },
      { mutates: true }
    );

    register(
      "transform.apply",
      "{id,shiftKey=false,ctrlKey=false,metaKey=false,altKey=false}",
      "Apply any built-in transform with the same modifier/scope semantics as the UI.",
      function (a) {
        assert(
          app.transformationsController.tools.some(function (item) {
            return item.toolId === a.id;
          }),
          "Unknown transform"
        );
        var control = !!(a.ctrlKey || a.metaKey);
        app.transformationsController.applyTool(a.id, {
          shiftKey: !!a.shiftKey,
          ctrlKey: control,
          metaKey: control,
          altKey: !!a.altKey
        });
        return state();
      },
      { mutates: true }
    );

    register(
      "history.state",
      "{}",
      "Read undo/redo availability and queue position.",
      historyState
    );
    ["undo", "redo"].forEach(function (action) {
      register(
        "history." + action,
        "{}",
        "Await editor history restoration before the next command.",
        function () {
          var h = app.historyService;
          assert(
            h && Array.isArray(h.stateQueue),
            "History service is not available"
          );
          var index = h.currentIndex + (action === "undo" ? -1 : 1);
          if (index < 0 || index >= h.stateQueue.length) {
            return state();
          }
          return new Promise(function (resolve, reject) {
            var timer;
            function done() {
              $.unsubscribe(Events.HISTORY_STATE_LOADED, done);
              window.clearTimeout(timer);
              resolve(state());
            }
            $.subscribe(Events.HISTORY_STATE_LOADED, done);
            timer = window.setTimeout(function () {
              $.unsubscribe(Events.HISTORY_STATE_LOADED, done);
              reject(new Error("History restore timed out"));
            }, 15000);
            h.lastLoadState = 0;
            h[action]();
          });
        },
        { mutates: true }
      );
    });

    function validateSetting(key, value) {
      text(key, "key");
      var schema = SETTING_SCHEMA[key];
      assert(schema, "Unsupported setting: " + key);
      if (schema.type === "boolean") {
        assert(typeof value === "boolean", "value must be boolean");
      } else if (schema.type === "integer") {
        value = integer(value, schema.min, schema.max, "value");
      } else if (schema.type === "number") {
        value = number(value, schema.min, schema.max, "value");
      } else if (schema.type === "enum") {
        value = oneOf(value, schema.values, "value");
      } else if (schema.type === "color") {
        value = settingColor(value);
      } else if (schema.type === "palette") {
        getPalette(value);
      } else if (schema.type === "size") {
        object(value, "value");
        value = {
          width: integer(value.width, 1, MAX_DIMENSION, "width"),
          height: integer(value.height, 1, MAX_DIMENSION, "height")
        };
      } else if (schema.type === "resize") {
        object(value, "value");
        value = {
          maintainRatio: !!value.maintainRatio,
          resizeContent: !!value.resizeContent,
          origin: oneOf(value.origin || "TOPLEFT", RESIZE_ORIGINS, "origin")
        };
      }
      return clone(value);
    }
    function setSetting(key, value) {
      var userSettings = getUserSettings();
      assert(userSettings, "User settings are not available");
      value = validateSetting(key, value);
      if (
        key === "PEN_SIZE" &&
        app.penSizeService &&
        app.penSizeService.setPenSize
      ) {
        app.penSizeService.setPenSize(value);
      } else {
        userSettings.set(key, value);
      }
      return value;
    }
    function settingsSchema() {
      var userSettings = getUserSettings();
      assert(userSettings, "User settings are not available");
      var result = {};
      Object.keys(SETTING_SCHEMA).forEach(function (key) {
        var schema = clone(SETTING_SCHEMA[key]);
        if (schema.type === "palette") {
          schema.values = app.paletteService
            ? listPalettes().map(function (palette) {
                return palette.id;
              })
            : [];
        } else if (schema.type === "size") {
          schema.min = 1;
          schema.max = MAX_DIMENSION;
        } else if (schema.type === "resize") {
          schema.origins = RESIZE_ORIGINS.slice();
        }
        result[key] = Object.assign({}, schema, {
          default: clone(userSettings.KEY_TO_DEFAULT_VALUE_MAP_[key]),
          value: clone(userSettings.get(key))
        });
      });
      return result;
    }

    register(
      "settings.read",
      "{key?}",
      "Read one setting or every current app setting.",
      function (a) {
        var values = readSettings();
        if (a.key === undefined) {
          return values;
        }
        assert(hasOwn(values, a.key), "Unsupported setting: " + a.key);
        return clone(values[a.key]);
      }
    );
    register(
      "settings.state",
      "{}",
      "Read current settings together with type/range/default metadata.",
      function () {
        return { values: readSettings(), schema: settingsSchema() };
      }
    );
    register(
      "settings.schema",
      "{}",
      "Discover all writable app settings.",
      settingsSchema
    );
    register(
      "settings.set",
      "{key,value}",
      "Validate and set any app preference supported by the UI.",
      function (a) {
        var value = setSetting(a.key, a.value);
        return { key: a.key, value: value, settings: readSettings() };
      },
      { mutates: true }
    );
    register(
      "settings.setMany",
      "{values:{KEY:value,...}}",
      "Atomically validate, then apply multiple app settings.",
      function (a) {
        object(a.values, "values");
        var validated = {};
        Object.keys(a.values).forEach(function (key) {
          validated[key] = validateSetting(key, a.values[key]);
        });
        Object.keys(validated).forEach(function (key) {
          setSetting(key, validated[key]);
        });
        return readSettings();
      },
      { mutates: true }
    );
    register(
      "settings.reset",
      "{key?}",
      "Reset one setting or every setting to app defaults.",
      function (a) {
        var userSettings = getUserSettings();
        assert(userSettings, "User settings are not available");
        var keys =
          a.key === undefined
            ? Object.keys(SETTING_SCHEMA)
            : [text(a.key, "key")];
        keys.forEach(function (key) {
          assert(hasOwn(SETTING_SCHEMA, key), "Unsupported setting: " + key);
          setSetting(key, clone(userSettings.KEY_TO_DEFAULT_VALUE_MAP_[key]));
        });
        return readSettings();
      },
      { mutates: true }
    );

    function waitForDatabase(database, label) {
      if (database && database.db) {
        return Promise.resolve(database);
      }
      return new Promise(function (resolve, reject) {
        var started = Date.now();
        function check() {
          if (database && database.db) {
            resolve(database);
          } else if (Date.now() - started >= 5000) {
            reject(new Error(label + " database is not ready"));
          } else {
            window.setTimeout(check, 25);
          }
        }
        check();
      });
    }
    function updateDescriptorForSave(a) {
      if (
        a.name === undefined &&
        a.description === undefined &&
        a.isPublic === undefined
      ) {
        return;
      }
      if (a.name !== undefined) {
        text(a.name, "name");
      }
      if (a.description !== undefined) {
        assert(
          typeof a.description === "string",
          "description must be a string"
        );
      }
      if (a.isPublic !== undefined) {
        assert(typeof a.isPublic === "boolean", "isPublic must be boolean");
      }
      var descriptor = c.getPiskel().getDescriptor();
      var changed = false;
      if (a.name !== undefined && descriptor.name !== a.name) {
        descriptor.name = a.name;
        changed = true;
      }
      if (
        a.description !== undefined &&
        descriptor.description !== a.description
      ) {
        descriptor.description = a.description;
        changed = true;
      }
      if (a.isPublic !== undefined && !!descriptor.isPublic !== a.isPublic) {
        descriptor.isPublic = a.isPublic;
        changed = true;
      }
      if (changed) {
        snapshot();
      }
    }

    register(
      "storage.capabilities",
      "{}",
      "Discover persistent targets available in this build.",
      function () {
        return {
          browser: !!app.indexedDbStorageService,
          legacyLocalStorage: !!app.localStorageService,
          download: !!app.fileDownloadStorageService,
          desktop: !!(
            pskl.utils.Environment &&
            pskl.utils.Environment.detectNodeWebkit &&
            pskl.utils.Environment.detectNodeWebkit()
          ),
          gallery: !!(app.isLoggedIn && app.isLoggedIn())
        };
      }
    );
    register(
      "storage.list",
      "{target='browser'|'legacy'}",
      "List drawings persisted in IndexedDB or legacy localStorage.",
      function (a) {
        var target = oneOf(
          a.target || "browser",
          ["browser", "legacy"],
          "target"
        );
        if (target === "legacy") {
          assert(app.localStorageService, "Legacy storage is not available");
          return clone(app.localStorageService.getKeys());
        }
        assert(app.indexedDbStorageService, "Browser storage is not available");
        return waitForDatabase(
          app.indexedDbStorageService.piskelDatabase,
          "Piskel"
        ).then(function () {
          return Promise.resolve(app.indexedDbStorageService.getKeys()).then(
            clone
          );
        });
      }
    );
    register(
      "storage.save",
      "{target='browser'|'download'|'desktop'|'gallery',name?,description?,isPublic?,saveAsNew=false}",
      "Save the current drawing using the app storage services.",
      function (a) {
        var target = oneOf(
          a.target || "browser",
          ["browser", "download", "desktop", "gallery"],
          "target"
        );
        if (target === "browser") {
          assert(
            app.indexedDbStorageService,
            "Browser storage is not available"
          );
        } else if (target === "download") {
          assert(
            app.fileDownloadStorageService,
            "File download is not available"
          );
        } else if (target === "desktop") {
          assert(
            pskl.utils.Environment &&
              pskl.utils.Environment.detectNodeWebkit &&
              pskl.utils.Environment.detectNodeWebkit(),
            "Desktop save is only available in the desktop build"
          );
        } else {
          assert(
            app.isLoggedIn && app.isLoggedIn(),
            "Gallery save requires an authenticated user"
          );
        }
        updateDescriptorForSave(a);
        var model = c.getPiskel();
        var operation;
        if (target === "browser") {
          assert(
            app.indexedDbStorageService,
            "Browser storage is not available"
          );
          operation = waitForDatabase(
            app.indexedDbStorageService.piskelDatabase,
            "Piskel"
          ).then(function () {
            return app.storageService.saveToIndexedDb(model);
          });
        } else if (target === "download") {
          operation = app.storageService.saveToFileDownload(model);
        } else if (target === "desktop") {
          operation = app.storageService.saveToDesktop(model, !!a.saveAsNew);
        } else {
          assert(
            app.isLoggedIn && app.isLoggedIn(),
            "Gallery save requires an authenticated user"
          );
          operation = app.storageService.saveToGallery(model);
        }
        return Promise.resolve(operation).then(function () {
          return fileState(false);
        });
      },
      { mutates: true }
    );
    register(
      "storage.load",
      "{name,target='browser'|'legacy'}",
      "Load a browser-saved drawing and wait for image decoding.",
      function (a) {
        var name = text(a.name, "name");
        var target = oneOf(
          a.target || "browser",
          ["browser", "legacy"],
          "target"
        );
        if (target === "legacy") {
          assert(app.localStorageService, "Legacy storage is not available");
          var serialized = app.localStorageService.getPiskel(name);
          assert(serialized, "Unknown saved drawing: " + name);
          return importPiskelData(serialized);
        }
        assert(app.indexedDbStorageService, "Browser storage is not available");
        return waitForDatabase(
          app.indexedDbStorageService.piskelDatabase,
          "Piskel"
        )
          .then(function (database) {
            return database.get(name);
          })
          .then(function (saved) {
            assert(saved && saved.serialized, "Unknown saved drawing: " + name);
            return importPiskelData(saved.serialized);
          });
      },
      { mutates: true }
    );
    register(
      "storage.remove",
      "{name,target='browser'|'legacy'}",
      "Delete a browser-saved drawing.",
      function (a) {
        var name = text(a.name, "name");
        var target = oneOf(
          a.target || "browser",
          ["browser", "legacy"],
          "target"
        );
        if (target === "legacy") {
          assert(app.localStorageService, "Legacy storage is not available");
          assert(
            app.localStorageService.getPiskel(name),
            "Unknown saved drawing: " + name
          );
          app.localStorageService.remove(name);
          return { name: name, target: target };
        }
        assert(app.indexedDbStorageService, "Browser storage is not available");
        return waitForDatabase(
          app.indexedDbStorageService.piskelDatabase,
          "Piskel"
        )
          .then(function (database) {
            return database.get(name);
          })
          .then(function (saved) {
            assert(saved, "Unknown saved drawing: " + name);
            return app.indexedDbStorageService.remove(name);
          })
          .then(function () {
            return { name: name, target: target };
          });
      },
      { mutates: true }
    );

    register(
      "backup.list",
      "{}",
      "List automatic backup sessions.",
      function () {
        assert(app.backupService, "Backup service is not available");
        return waitForDatabase(app.backupService.backupDatabase, "Backup").then(
          function () {
            return Promise.resolve(app.backupService.list()).then(clone);
          }
        );
      }
    );
    register(
      "backup.snapshots",
      "{sessionId,includeSerialized=false}",
      "List snapshots in one backup session.",
      function (a) {
        var sessionId = text(a.sessionId, "sessionId");
        return waitForDatabase(app.backupService.backupDatabase, "Backup")
          .then(function () {
            return app.backupService.getSnapshotsBySessionId(sessionId);
          })
          .then(function (snapshots) {
            return snapshots.map(function (item) {
              var copy = clone(item);
              if (!a.includeSerialized) {
                delete copy.serialized;
              }
              return copy;
            });
          });
      }
    );
    register(
      "backup.create",
      "{}",
      "Create/update the automatic backup for current work.",
      function () {
        return waitForDatabase(app.backupService.backupDatabase, "Backup")
          .then(function () {
            return app.backupService.backup();
          })
          .then(function () {
            return { created: true };
          });
      },
      { mutates: true }
    );
    register(
      "backup.load",
      "{snapshotId}",
      "Restore one backup snapshot and wait until the editor is ready.",
      function (a) {
        var snapshotId = integer(
          a.snapshotId,
          1,
          Number.MAX_SAFE_INTEGER,
          "snapshotId"
        );
        return waitForDatabase(app.backupService.backupDatabase, "Backup")
          .then(function (database) {
            return database.getSnapshot(snapshotId);
          })
          .then(function (saved) {
            assert(saved && saved.serialized, "Unknown backup snapshot");
            return importPiskelData(saved.serialized);
          });
      },
      { mutates: true }
    );
    register(
      "backup.remove",
      "{sessionId}",
      "Delete every snapshot in one backup session.",
      function (a) {
        var sessionId = text(a.sessionId, "sessionId");
        return waitForDatabase(app.backupService.backupDatabase, "Backup")
          .then(function () {
            return app.backupService.deleteSession(sessionId);
          })
          .then(function () {
            return { sessionId: sessionId };
          });
      },
      { mutates: true }
    );

    register(
      "view.state",
      "{}",
      "Read canvas zoom/pan and preview state.",
      viewState
    );
    register(
      "view.zoom",
      "{value?,delta?,center?}",
      "Set an absolute canvas zoom or change it by app zoom steps.",
      function (a) {
        var dc = app.drawingController;
        assert(dc, "Drawing view is not available");
        assert(
          a.value !== undefined || a.delta !== undefined,
          "Provide value or delta"
        );
        if (a.value !== undefined) {
          dc.setZoom_(number(a.value, 0.01, 10000, "value"));
        } else {
          var delta = number(a.delta, -1000, 1000, "delta");
          if (a.center !== undefined) {
            object(a.center, "center");
            number(a.center.x, -MAX_DIMENSION, MAX_DIMENSION * 2, "center.x");
            number(a.center.y, -MAX_DIMENSION, MAX_DIMENSION * 2, "center.y");
          }
          dc.updateZoom_(delta, a.center);
        }
        return viewState();
      },
      { mutates: true }
    );
    register(
      "view.pan",
      "{x?,y?,dx?,dy?}",
      "Set or offset the canvas viewport in sprite coordinates.",
      function (a) {
        var dc = app.drawingController;
        assert(
          dc && dc.getOffset && dc.setOffset,
          "Drawing view is not available"
        );
        var current = dc.getOffset();
        var dx = a.dx === undefined ? 0 : number(a.dx, -1000000, 1000000, "dx");
        var dy = a.dy === undefined ? 0 : number(a.dy, -1000000, 1000000, "dy");
        var x = a.x === undefined ? current.x + dx : a.x;
        var y = a.y === undefined ? current.y + dy : a.y;
        number(x, -1000000, 1000000, "x");
        number(y, -1000000, 1000000, "y");
        dc.setOffset(x, y);
        return viewState();
      },
      { mutates: true }
    );
    register(
      "view.reset",
      "{}",
      "Fit the canvas and reset its viewport offset.",
      function () {
        var dc = app.drawingController;
        assert(dc, "Drawing view is not available");
        dc.resetZoom_();
        dc.setOffset(0, 0);
        return viewState();
      },
      { mutates: true }
    );
    register(
      "view.popupPreview",
      "{open=true}",
      "Open or close the detached animation preview (popup policies still apply).",
      function (a) {
        var popup = app.previewController.popupPreviewController;
        var shouldOpen = a.open !== false;
        if (shouldOpen && !popup.isOpen()) {
          var opened = window.open("about:blank", "", "width=320,height=320");
          assert(opened, "Preview popup was blocked by the browser");
          popup.popup = opened;
          window.setTimeout(popup.onPopupLoaded.bind(popup), 500);
        } else if (shouldOpen) {
          popup.popup.focus();
        } else if (popup.isOpen()) {
          popup.popup.close();
          popup.popup = null;
        }
        var nextView = viewState();
        emitEvent("view", { popupPreviewOpen: nextView.popupPreviewOpen });
        return nextView;
      },
      { mutates: true }
    );

    register(
      "ui.state",
      "{}",
      "Read open settings drawer, dialog and popup state.",
      viewState
    );
    register(
      "ui.settings",
      "{panel:'user'|'resize'|'save'|'export'|'import'|'localstorage'|'console'|null}",
      "Open a settings drawer panel or close the drawer.",
      function (a) {
        var controller = app.settingsController;
        assert(controller, "Settings UI is not available");
        if (a.panel === null || a.panel === undefined || a.open === false) {
          controller.closeDrawer_();
        } else {
          oneOf(
            a.panel,
            [
              "user",
              "resize",
              "save",
              "export",
              "import",
              "localstorage",
              "console"
            ],
            "panel"
          );
          if (controller.currentSetting !== a.panel) {
            controller.loadSetting_(a.panel);
          }
        }
        var nextView = viewState();
        emitEvent("ui", { settingsPanel: nextView.settingsPanel });
        return nextView;
      },
      { mutates: true }
    );
    register(
      "ui.dialog",
      "{id:'cheatsheet'|'create-palette'|'browse-local'|'import'|'performance-info'|'browse-backups',open=true}",
      "Open or close any normal app dialog.",
      function (a) {
        var controller = app.dialogsController;
        assert(controller, "Dialog UI is not available");
        if (a.open === false || a.id === null) {
          var wasOpen = controller.isDisplayingDialog_();
          controller.hideDialog();
          if (!wasOpen) {
            return viewState();
          }
          return new Promise(function (resolve) {
            window.setTimeout(function () {
              var nextView = viewState();
              emitEvent("ui", { dialog: null });
              resolve(nextView);
            }, 525);
          });
        }
        var id = oneOf(
          a.id,
          [
            "cheatsheet",
            "create-palette",
            "browse-local",
            "import",
            "performance-info",
            "browse-backups"
          ],
          "id"
        );
        if (controller.getCurrentDialogId_() !== id) {
          if (controller.isDisplayingDialog_()) {
            throw new Error(
              "Close the current dialog before opening another one"
            );
          }
          controller.showDialog(id, a.initArgs);
          emitEvent("ui", { dialog: id });
        }
        return viewState();
      },
      { mutates: true }
    );
    register(
      "ui.notify",
      "{message,hideDelay=3000}",
      "Show an app notification.",
      function (a) {
        var message = text(a.message, "message");
        assert(message.length <= 1000, "message is too long");
        var hideDelay = integer(
          a.hideDelay === undefined ? 3000 : a.hideDelay,
          0,
          60000,
          "hideDelay"
        );
        $.publish(Events.SHOW_NOTIFICATION, [
          { content: pskl.utils.escapeHtml(message), hideDelay: hideDelay }
        ]);
        return { message: message, hideDelay: hideDelay };
      },
      { mutates: true }
    );

    function listShortcuts() {
      assert(
        app.shortcutService && app.shortcutService.getShortcuts,
        "Shortcut service is not available"
      );
      var categoryById = {};
      pskl.service.keyboard.Shortcuts.CATEGORIES.forEach(function (category) {
        var entries = pskl.service.keyboard.Shortcuts[category];
        Object.keys(entries).forEach(function (key) {
          categoryById[entries[key].getId()] = category.toLowerCase();
        });
      });
      return app.shortcutService.getShortcuts().map(function (shortcut) {
        return {
          id: shortcut.getId(),
          category: categoryById[shortcut.getId()] || null,
          description: shortcut.getDescription(),
          keys: shortcut.getKeys().slice(),
          displayKey: shortcut.getDisplayKey(),
          editable: shortcut.isEditable(),
          custom: shortcut.isCustom()
        };
      });
    }
    register(
      "shortcut.list",
      "{}",
      "List every app keyboard shortcut and current mapping.",
      listShortcuts
    );
    register(
      "shortcut.set",
      "{id,key:string|null}",
      "Remap an editable shortcut, resolving duplicate keys like the preferences UI.",
      function (a) {
        var id = text(a.id, "id");
        var shortcut = app.shortcutService.getShortcutById(id);
        assert(shortcut, "Unknown shortcut");
        assert(shortcut.isEditable(), "Shortcut is not editable");
        if (a.key === null || a.key === "") {
          shortcut.updateKeys([]);
          $.publish(Events.SHORTCUTS_CHANGED);
        } else {
          text(a.key, "key");
          assert(a.key.length <= 64, "key is too long");
          var normalizedKey = a.key.replace(/\s/g, "");
          assert(
            pskl.service.keyboard.Shortcuts.FORBIDDEN_KEYS.indexOf(
              normalizedKey
            ) === -1,
            "Key cannot be remapped: " + normalizedKey
          );
          app.shortcutService.updateShortcut(shortcut, a.key);
        }
        return listShortcuts().filter(function (item) {
          return item.id === id;
        })[0];
      },
      { mutates: true }
    );
    register(
      "shortcut.reset",
      "{id?}",
      "Restore one shortcut or all shortcuts to defaults.",
      function (a) {
        if (a.id === undefined) {
          app.shortcutService.restoreDefaultShortcuts();
        } else {
          var shortcut = app.shortcutService.getShortcutById(text(a.id, "id"));
          assert(shortcut, "Unknown shortcut");
          shortcut.restoreDefault();
          $.publish(Events.SHORTCUTS_CHANGED);
        }
        return listShortcuts();
      },
      { mutates: true }
    );
    register(
      "shortcut.trigger",
      "{id}",
      "Invoke one currently registered shortcut action without synthesizing a key event.",
      function (a) {
        var id = text(a.id, "id");
        var registration = (app.shortcutService.shortcuts_ || []).filter(
          function (item) {
            return item.shortcut.getId() === id;
          }
        )[0];
        assert(registration, "Shortcut is not currently registered");
        registration.callback(registration.shortcut.getKeys()[0]);
        return state();
      },
      { mutates: true }
    );
    register(
      "tool.stroke",
      "{points:[{x,y}],button=0,shiftKey=false,ctrlKey=false,altKey=false}",
      "Use the selected native tool, including selection/mirror/dither/move. Pixel coordinates, current frame/layer.",
      function (a) {
        assert(
          Array.isArray(a.points) &&
            a.points.length > 0 &&
            a.points.length <= 100000,
          "points must contain 1..100000 coordinates"
        );
        var f = c.getCurrentFrame();
        a.points.forEach(function (p) {
          object(p, "point");
          point(f, p.x, p.y);
        });
        var button = a.button === undefined ? 0 : a.button;
        assert(
          button === 0 || button === 2,
          "button must be 0 (primary) or 2 (secondary)"
        );
        var dc = app.drawingController;
        assert(!dc.isClicked, "A user gesture is already in progress");
        var tool = dc.currentToolBehavior;
        var event = {
          type: "mousedown",
          button: button,
          shiftKey: !!a.shiftKey,
          ctrlKey: !!a.ctrlKey,
          altKey: !!a.altKey
        };
        var first = a.points[0];
        var last = a.points[a.points.length - 1];
        $.publish(Events.MOUSE_EVENT, [event, dc]);
        try {
          tool.hideHighlightedPixel(dc.overlayFrame);
          $.publish(Events.TOOL_PRESSED);
          tool.applyToolAt(first.x, first.y, f, dc.overlayFrame, event);
          event.type = "mousemove";
          a.points.slice(1).forEach(function (p) {
            tool.moveToolAt(p.x, p.y, f, dc.overlayFrame, event);
          });
          event.type = "mouseup";
          tool.releaseToolAt(last.x, last.y, f, dc.overlayFrame, event);
        } finally {
          event.type = "mouseup";
          $.publish(Events.TOOL_RELEASED);
          $.publish(Events.MOUSE_EVENT, [event, dc]);
        }
        return state();
      },
      { mutates: true }
    );
    register(
      "selection.read",
      "{}",
      "Read selected pixels, or null (backward-compatible compact result).",
      function () {
        var selection = app.selectionManager.currentSelection;
        return selection ? clone(selection.pixels) : null;
      }
    );
    register(
      "selection.state",
      "{includePixels=true}",
      "Read selection bounds, content state and optional pixels.",
      function (a) {
        var result = selectionState();
        if (a.includePixels !== false && result.active) {
          result.pixels = clone(app.selectionManager.currentSelection.pixels);
        }
        result.clipboard = apiClipboard ? { count: apiClipboard.length } : null;
        return result;
      }
    );
    register(
      "selection.create",
      "{x,y,width,height}|{pixels:[{x,y}]}",
      "Create a rectangular or explicit pixel selection and select the matching native tool.",
      function (a) {
        var points;
        var toolId;
        if (a.pixels !== undefined) {
          assert(
            Array.isArray(a.pixels) && a.pixels.length > 0,
            "pixels must not be empty"
          );
          assert(
            a.pixels.length <= c.getWidth() * c.getHeight(),
            "too many selection pixels"
          );
          var seen = Object.create(null);
          points = a.pixels.map(function (item) {
            object(item, "selection pixel");
            var col = item.col === undefined ? item.x : item.col;
            var row = item.row === undefined ? item.y : item.row;
            integer(col, 0, c.getWidth() - 1, "x");
            integer(row, 0, c.getHeight() - 1, "y");
            var key = col + ":" + row;
            assert(!seen[key], "selection pixels must be unique");
            seen[key] = true;
            return { col: col, row: row };
          });
          toolId = "tool-shape-select";
          $.publish(Events.SELECT_TOOL, [toolId]);
          var selection = new pskl.selection.ShapeSelection(points);
          selection.hasPastedContent = false;
          selection.time = -1;
          var tool = app.drawingController.currentToolBehavior;
          tool.selection = selection;
          tool.hasSelection = true;
          $.publish(Events.SELECTION_CREATED, [selection]);
          app.drawingController.overlayFrame.clear();
          tool.drawSelectionOnOverlay_(app.drawingController.overlayFrame);
        } else {
          var x = integer(a.x, 0, c.getWidth() - 1, "x");
          var y = integer(a.y, 0, c.getHeight() - 1, "y");
          var width = integer(a.width, 1, c.getWidth(), "width");
          var height = integer(a.height, 1, c.getHeight(), "height");
          point(c.getCurrentFrame(), x + width - 1, y + height - 1);
          toolId = "tool-rectangle-select";
          $.publish(Events.SELECT_TOOL, [toolId]);
          commands["tool.stroke"].run({
            points: [
              { x: x, y: y },
              { x: x + width - 1, y: y + height - 1 }
            ]
          });
        }
        return commands["selection.state"].run({ includePixels: true });
      },
      { mutates: true }
    );
    register(
      "selection.copy",
      "{}",
      "Copy selection pixels to the API clipboard.",
      function () {
        var selection = app.selectionManager.currentSelection;
        assert(selection, "No selection");
        selection.fillSelectionFromFrame(c.getCurrentFrame());
        apiClipboard = clone(selection.pixels);
        emitEvent("selection", {
          clipboard: { count: apiClipboard.length },
          selection: selectionState()
        });
        return { count: apiClipboard.length, pixels: clone(apiClipboard) };
      },
      { mutates: true }
    );
    register(
      "selection.cut",
      "{}",
      "Copy then erase selected pixels.",
      function () {
        var copied = commands["selection.copy"].run({});
        app.selectionManager.erase();
        $.publish(Events.PISKEL_RESET);
        return { clipboard: copied, state: state() };
      },
      { mutates: true }
    );
    register(
      "selection.paste",
      "{pixels?,offsetX=0,offsetY=0,clip=false}",
      "Paste explicit pixels or the API clipboard into the current frame.",
      function (a) {
        if (a.clip !== undefined) {
          assert(typeof a.clip === "boolean", "clip must be boolean");
        }
        var source = a.pixels === undefined ? apiClipboard : a.pixels;
        assert(
          Array.isArray(source) && source.length > 0,
          "API clipboard is empty"
        );
        var offsetX = integer(
          a.offsetX === undefined ? 0 : a.offsetX,
          -MAX_DIMENSION,
          MAX_DIMENSION,
          "offsetX"
        );
        var offsetY = integer(
          a.offsetY === undefined ? 0 : a.offsetY,
          -MAX_DIMENSION,
          MAX_DIMENSION,
          "offsetY"
        );
        var pixels = [];
        source.forEach(function (item) {
          object(item, "pixel");
          var sourceCol = integer(
            item.col === undefined ? item.x : item.col,
            -MAX_DIMENSION,
            MAX_DIMENSION * 2,
            "pixel x"
          );
          var sourceRow = integer(
            item.row === undefined ? item.y : item.row,
            -MAX_DIMENSION,
            MAX_DIMENSION * 2,
            "pixel y"
          );
          var value = pixelValue(item.color);
          var col = sourceCol + offsetX;
          var row = sourceRow + offsetY;
          var inside = c.getCurrentFrame().containsPixel(col, row);
          assert(inside || a.clip, "pasted pixel is outside the frame");
          if (inside) {
            pixels.push({ col: col, row: row, color: value });
          }
        });
        assert(pixels.length > 0, "No pasted pixels are inside the frame");
        app.selectionManager.pastePixelsOnCurrentFrame_(pixels);
        $.publish(Events.PISKEL_RESET);
        return { count: pixels.length, state: state() };
      },
      { mutates: true }
    );
    register(
      "selection.move",
      "{dx,dy,moveContent=false,clip=false}",
      "Move selection coordinates and optionally move their frame content atomically.",
      function (a) {
        var selection = app.selectionManager.currentSelection;
        assert(selection, "No selection");
        if (a.clip !== undefined) {
          assert(typeof a.clip === "boolean", "clip must be boolean");
        }
        if (a.moveContent !== undefined) {
          assert(
            typeof a.moveContent === "boolean",
            "moveContent must be boolean"
          );
        }
        var dx = integer(a.dx, -MAX_DIMENSION, MAX_DIMENSION, "dx");
        var dy = integer(a.dy, -MAX_DIMENSION, MAX_DIMENSION, "dy");
        var target = c.getCurrentFrame();
        var moved = [];
        selection.pixels.forEach(function (item) {
          var next = {
            col: item.col + dx,
            row: item.row + dy,
            color: item.color
          };
          assert(
            target.containsPixel(next.col, next.row) || a.clip,
            "moved selection is outside the frame"
          );
          if (target.containsPixel(next.col, next.row)) {
            moved.push(next);
          }
        });
        assert(
          moved.length > 0,
          "No moved selection pixels are inside the frame"
        );
        if (a.moveContent) {
          var copy = target.clone();
          var content = selection.pixels.map(function (item) {
            return {
              col: item.col + dx,
              row: item.row + dy,
              color: target.getPixel(item.col, item.row)
            };
          });
          selection.pixels.forEach(function (item) {
            copy.setPixel(item.col, item.row, Constants.TRANSPARENT_COLOR);
          });
          content.forEach(function (item) {
            if (copy.containsPixel(item.col, item.row)) {
              copy.setPixel(item.col, item.row, item.color);
            }
          });
          target.setPixels(copy.getPixels());
          snapshot();
        }
        selection.pixels = moved;
        var selectedTool = app.drawingController.currentToolBehavior;
        if (selectedTool && selectedTool.drawSelectionOnOverlay_) {
          app.drawingController.overlayFrame.clear();
          selectedTool.selection = selection;
          selectedTool.drawSelectionOnOverlay_(
            app.drawingController.overlayFrame
          );
        }
        var nextSelection = commands["selection.state"].run({
          includePixels: true
        });
        emitEvent("selection", nextSelection);
        return nextSelection;
      },
      { mutates: true }
    );
    register(
      "selection.commit",
      "{}",
      "Commit floating selection.",
      function () {
        app.selectionManager.commit();
        return state();
      },
      { mutates: true }
    );
    register(
      "selection.erase",
      "{}",
      "Erase selected pixels.",
      function () {
        assert(app.selectionManager.currentSelection, "No selection");
        app.selectionManager.erase();
        $.publish(Events.PISKEL_RESET);
        return state();
      },
      { mutates: true }
    );
    register(
      "selection.dismiss",
      "{}",
      "Dismiss selection without changing pixels.",
      function () {
        $.publish(Events.SELECTION_DISMISSED);
        return state();
      },
      { mutates: true }
    );
    register(
      "selection.clipboard",
      "{}",
      "Read the isolated API clipboard.",
      function () {
        return apiClipboard ? clone(apiClipboard) : null;
      }
    );

    function emitEvent(type, details) {
      revision++;
      var event = {
        type: type,
        revision: revision,
        timestamp: Date.now(),
        details: details === undefined ? null : clone(details)
      };
      eventLog.push(event);
      if (eventLog.length > MAX_EVENT_LOG) {
        eventLog.shift();
      }
      [type, "change"].forEach(function (eventType) {
        (listeners[eventType] || []).slice().forEach(function (callback) {
          try {
            callback(clone(event));
          } catch (error) {
            window.setTimeout(function () {
              console.error("piskelAPI event listener failed", error);
            }, 0);
          }
        });
      });
    }
    var bridgeSubscriptions = [];
    function bridge(internalEvent, publicEvent, detailsBuilder) {
      if (!internalEvent || typeof $.subscribe !== "function") {
        return;
      }
      var callback = function () {
        var args = Array.prototype.slice.call(arguments, 1);
        var details = detailsBuilder ? detailsBuilder.apply(null, args) : null;
        emitEvent(publicEvent, details);
      };
      $.subscribe(internalEvent, callback);
      bridgeSubscriptions.push({ event: internalEvent, callback: callback });
    }
    bridge(Events.PISKEL_RESET, "document");
    bridge(Events.TOOL_RELEASED, "document", function () {
      return { hash: c.getPiskel().getHash() };
    });
    bridge(Events.FRAME_SIZE_CHANGED, "document", function () {
      return { width: c.getWidth(), height: c.getHeight() };
    });
    bridge(Events.FPS_CHANGED, "document", function () {
      return { fps: c.getFPS() };
    });
    bridge(Events.USER_SETTINGS_CHANGED, "settings", function (key, value) {
      return { key: key, value: value };
    });
    bridge(Events.HISTORY_STATE_SAVED, "history", historyState);
    bridge(Events.HISTORY_STATE_LOADED, "history", historyState);
    bridge(Events.SELECTION_CREATED, "selection", selectionState);
    bridge(Events.SELECTION_MOVE_REQUEST, "selection", selectionState);
    bridge(Events.SELECTION_DISMISSED, "selection", selectionState);
    bridge(Events.PALETTE_LIST_UPDATED, "palette");
    bridge(Events.TOOL_SELECTED, "tool", function (tool) {
      return { id: tool && tool.toolId ? tool.toolId : null };
    });
    bridge(Events.PRIMARY_COLOR_SELECTED, "tool", function (value) {
      return { primaryColor: value };
    });
    bridge(Events.SECONDARY_COLOR_SELECTED, "tool", function (value) {
      return { secondaryColor: value };
    });
    bridge(Events.PEN_SIZE_CHANGED, "tool", function () {
      return { penSize: app.penSizeService.getPenSize() };
    });
    bridge(Events.ZOOM_CHANGED, "view", viewState);
    bridge(Events.DIALOG_SHOW, "ui", function (value) {
      return value;
    });
    bridge(Events.DIALOG_HIDE, "ui", function () {
      return { dialog: null };
    });
    bridge(Events.CLOSE_SETTINGS_DRAWER, "ui", function () {
      return { settingsPanel: null };
    });
    bridge(Events.SHOW_NOTIFICATION, "ui", function (value) {
      return { notification: value || null };
    });
    bridge(Events.HIDE_NOTIFICATION, "ui", function () {
      return { notification: null };
    });
    bridge(Events.BEFORE_SAVING_PISKEL, "save", function () {
      return { saving: true };
    });
    bridge(Events.AFTER_SAVING_PISKEL, "save", function () {
      return { saving: false };
    });
    bridge(Events.PISKEL_SAVED, "save", function () {
      return { saved: true };
    });

    api.waitForChange = function (options) {
      options = options || {};
      var since = integer(
        options.since === undefined ? revision : options.since,
        0,
        Number.MAX_SAFE_INTEGER,
        "since"
      );
      var type = options.type;
      if (type !== undefined) {
        oneOf(type, PUBLIC_EVENTS.slice(1), "type");
      }
      var existing = eventLog.filter(function (event) {
        return event.revision > since && (!type || event.type === type);
      })[0];
      if (existing) {
        return Promise.resolve(clone(existing));
      }
      var timeout = integer(
        options.timeout === undefined ? 30000 : options.timeout,
        0,
        120000,
        "timeout"
      );
      return new Promise(function (resolve, reject) {
        var timer;
        var unsubscribe = api.on("change", function (event) {
          if (event.revision > since && (!type || event.type === type)) {
            unsubscribe();
            window.clearTimeout(timer);
            resolve(event);
          }
        });
        timer = window.setTimeout(function () {
          unsubscribe();
          reject(new Error("Timed out waiting for editor change"));
        }, timeout);
      });
    };
    api.destroy = function () {
      if (typeof $.unsubscribe === "function") {
        bridgeSubscriptions.forEach(function (item) {
          $.unsubscribe(item.event, item.callback);
        });
      }
      bridgeSubscriptions = [];
      listeners = Object.create(null);
    };
    api.getState = api.app.state;
    api.getDocument = api.document.read;
    api.getSettings = api.settings.read;
    return api;
  };
})();
