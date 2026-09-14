/** Console and automation facade. No eval, network listener or private-object exposure. */
(function () {
  var ns = $.namespace("pskl.api");

  ns.create = function (app) {
    var commands = Object.create(null);
    var api = { version: "1.0.0" };
    var queue = Promise.resolve();
    var c = app.corePiskelController;
    var pub = app.piskelController;

    function assert(ok, message) {
      if (!ok) {
        throw new Error(message);
      }
    }
    function integer(value, min, max, label) {
      assert(
        Number.isInteger(value) && value >= min && value <= max,
        label + " must be an integer in [" + min + ", " + max + "]"
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
    function color(value) {
      if (value === "transparent") {
        return Constants.TRANSPARENT_COLOR;
      }
      assert(
        typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value),
        "color must be #RRGGBB or transparent"
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
    function capacity(layers, frames) {
      assert(
        layers <= 256 &&
          frames <= 10000 &&
          c.getWidth() * c.getHeight() * layers * frames <= 16777216,
        "Document too large"
      );
    }
    function snapshot() {
      $.publish(Events.PISKEL_RESET);
      $.publish(Events.PISKEL_SAVE_STATE, {
        type: pskl.service.HistoryService.SNAPSHOT
      });
    }
    function state() {
      return {
        name: c.getPiskel().getDescriptor().name,
        description: c.getPiskel().getDescriptor().description,
        width: c.getWidth(),
        height: c.getHeight(),
        fps: c.getFPS(),
        layer: c.getCurrentLayerIndex(),
        frame: c.getCurrentFrameIndex(),
        frameCount: c.getFrameCount(),
        hiddenFrames: c.getPiskel().hiddenFrames.slice(),
        layers: c.getLayers().map(function (l, index) {
          return { index: index, name: l.getName(), opacity: l.getOpacity() };
        }),
        tool: app.toolController.currentSelectedTool.toolId,
        primaryColor: app.selectedColorsService.getPrimaryColor(),
        secondaryColor: app.selectedColorsService.getSecondaryColor(),
        penSize: app.penSizeService.getPenSize()
      };
    }
    function register(name, args, description, fn) {
      commands[name] = { args: args, description: description, run: fn };
      var parts = name.split(".");
      api[parts[0]] = api[parts[0]] || {};
      api[parts[0]][parts[1]] = function (params) {
        return api.execute(name, params);
      };
    }
    api.help = function () {
      return Object.keys(commands).map(function (name) {
        return {
          command: name,
          args: commands[name].args,
          description: commands[name].description
        };
      });
    };
    api.execute = function (command, args) {
      if (command && typeof command === "object") {
        args = command.args;
        command = command.command;
      }
      var run = queue.then(function () {
        assert(
          typeof command === "string" && Object.hasOwn(commands, command),
          "Unknown command: " + command
        );
        assert(
          args === undefined ||
            (args !== null && typeof args === "object" && !Array.isArray(args)),
          "args must be an object"
        );
        return commands[command].run(args || {});
      });
      queue = run.catch(function () {});
      return run;
    };
    api.batch = async function (items) {
      assert(
        Array.isArray(items) && items.length <= 1000,
        "batch must contain at most 1000 commands"
      );
      var results = [];
      for (var i = 0; i < items.length; i++) {
        results.push(await api.execute(items[i]));
      }
      return results;
    };

    register(
      "app.state",
      "{}",
      "Read JSON editor state (no mutable model references).",
      state
    );
    register(
      "document.new",
      "{width=32,height=32,name='New Piskel',description='',fps=12}",
      "Replace current document; export first to keep a file copy.",
      function (a) {
        var w = integer(a.width === undefined ? 32 : a.width, 1, 2048, "width");
        var h = integer(
          a.height === undefined ? 32 : a.height,
          1,
          2048,
          "height"
        );
        var fps = integer(a.fps === undefined ? 12 : a.fps, 1, 60, "fps");
        var name = text(a.name === undefined ? "New Piskel" : a.name, "name");
        assert(
          a.description === undefined || typeof a.description === "string",
          "description must be a string"
        );
        var p = new pskl.model.Piskel(
          w,
          h,
          fps,
          new pskl.model.piskel.Descriptor(name, a.description || "")
        );
        var l = new pskl.model.Layer("Layer 1");
        l.addFrame(new pskl.model.Frame(w, h));
        p.addLayer(l);
        pub.setPiskel(p);
        return state();
      }
    );
    register(
      "document.update",
      "{name?,description?,fps?}",
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
        if (a.fps !== undefined) {
          integer(a.fps, 1, 60, "fps");
        }
        var d = c.getPiskel().getDescriptor();
        if (a.name !== undefined) {
          d.name = a.name;
        }
        if (a.description !== undefined) {
          d.description = a.description;
        }
        if (a.fps !== undefined) {
          c.setFPS(a.fps);
        }
        snapshot();
        return state();
      }
    );
    register(
      "document.resize",
      "{width,height}",
      "Crop/pad every frame, anchored top-left (no resampling).",
      function (a) {
        var w = integer(a.width, 1, 2048, "width");
        var h = integer(a.height, 1, 2048, "height");
        assert(
          w * h * c.getFrameCount() * c.getLayers().length <= 16777216,
          "Document too large"
        );
        var p = new pskl.model.Piskel(
          w,
          h,
          c.getFPS(),
          c.getPiskel().getDescriptor()
        );
        c.getLayers().forEach(function (old) {
          var l = new pskl.model.Layer(old.getName());
          l.setOpacity(old.getOpacity());
          old.getFrames().forEach(function (f) {
            var next = new pskl.model.Frame(w, h);
            for (var y = 0; y < Math.min(h, f.getHeight()); y++) {
              for (var x = 0; x < Math.min(w, f.getWidth()); x++) {
                next.setPixel(x, y, f.getPixel(x, y));
              }
            }
            l.addFrame(next);
          });
          p.addLayer(l);
        });
        p.hiddenFrames = c.getPiskel().hiddenFrames.slice();
        pub.setPiskel(p, { preserveState: true });
        return state();
      }
    );
    register(
      "file.export",
      "{format='piskel',download=false,name?}",
      "Return .piskel JSON or PNG spritesheet data URL; optionally download.",
      function (a) {
        var format = a.format || "piskel";
        assert(
          format === "piskel" || format === "png",
          "format must be piskel or png"
        );
        var data =
          format === "piskel" ? c.serialize() : app.getFramesheetAsPng();
        if (a.download) {
          var url =
            format === "piskel"
              ? URL.createObjectURL(
                  new Blob([data], { type: "application/json" })
                )
              : data;
          var link = document.createElement("a");
          link.href = url;
          link.download =
            (a.name || c.getPiskel().getDescriptor().name) + "." + format;
          link.click();
          if (format === "piskel") {
            window.setTimeout(function () {
              URL.revokeObjectURL(url);
            }, 1000);
          }
        }
        return data;
      }
    );
    register(
      "file.import",
      "{data: string|object}",
      "Load current-version .piskel data, asynchronously.",
      function (a) {
        var data =
          typeof a.data === "string"
            ? JSON.parse(a.data)
            : JSON.parse(JSON.stringify(a.data));
        assert(
          data && data.modelVersion === Constants.MODEL_VERSION && data.piskel,
          "Expected current-version .piskel data"
        );
        var p = data.piskel;
        integer(p.width, 1, 2048, "width");
        integer(p.height, 1, 2048, "height");
        assert(
          Array.isArray(p.layers) && p.layers.length > 0,
          "layers must not be empty"
        );
        var count;
        p.layers.forEach(function (encoded) {
          var l = JSON.parse(encoded);
          integer(l.frameCount, 1, 10000, "frameCount");
          count = count || l.frameCount;
          assert(
            l.frameCount === count,
            "All layers must have equal frame counts"
          );
          assert(
            Array.isArray(l.chunks) &&
              l.chunks.length > 0 &&
              l.chunks.every(function (chunk) {
                return (
                  typeof chunk.base64PNG === "string" &&
                  chunk.base64PNG.startsWith("data:image/png;base64,") &&
                  Array.isArray(chunk.layout)
                );
              }),
            "Expected embedded PNG chunks"
          );
        });
        assert(
          p.width * p.height * count * p.layers.length <= 16777216,
          "Document too large"
        );
        return new Promise(function (resolve, reject) {
          var timer;
          var active = true;
          // A timed-out decode must never replace the current document later.
          timer = window.setTimeout(function () {
            active = false;
            reject(new Error("Import timed out"));
          }, 15000);
          pskl.utils.serialization.Deserializer.deserialize(
            data,
            function (loaded) {
              if (!active) {
                return;
              }
              window.clearTimeout(timer);
              try {
                assert(
                  loaded.getFrameCount() === count,
                  "Decoded frame count does not match"
                );
                loaded.getLayers().forEach(function (l) {
                  assert(
                    l.size() === count,
                    "Decoded layers have different frame counts"
                  );
                  l.getFrames().forEach(function (f) {
                    assert(
                      f &&
                        f.getWidth() === p.width &&
                        f.getHeight() === p.height,
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
              active = false;
              window.clearTimeout(timer);
              reject(new Error(String(error)));
            }
          );
        });
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
          "{layer?}",
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
            c[methods[action]](action === "mergeDown" ? i : undefined);
            snapshot();
            return state();
          }
        );
      }
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
      "frame.read",
      "{layer?,frame?}",
      "Return row-major #RRGGBB/rgba pixel rows for one layer/frame.",
      function (a) {
        var f = c.getLayerAt(layer(a)).getFrameAt(frame(a));
        var rows = [];
        for (var y = 0; y < c.getHeight(); y++) {
          var row = [];
          for (var x = 0; x < c.getWidth(); x++) {
            row.push(pskl.utils.intToColor(f.getPixel(x, y)));
          }
          rows.push(row);
        }
        return rows;
      }
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
      "palette.list",
      "{}",
      "List stored and dynamic palettes.",
      function () {
        return app.paletteService.getPalettes().map(function (p) {
          return {
            id: p.id,
            name: p.name,
            colors: p.getColors().slice(),
            readOnly: app.paletteService.dynamicPalettes.indexOf(p) !== -1
          };
        });
      }
    );
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
        assert(
          !app.paletteService.dynamicPalettes.some(function (p) {
            return p.id === id;
          }),
          "Dynamic palette is read-only"
        );
        app.paletteService.savePalette(
          new pskl.model.Palette(id, a.name, colors)
        );
        return { id: id, name: a.name, colors: colors };
      }
    );
    register("palette.remove", "{id}", "Delete stored palette.", function (a) {
      text(a.id, "id");
      assert(app.paletteService.getPaletteById(a.id), "Unknown palette");
      assert(
        !app.paletteService.dynamicPalettes.some(function (p) {
          return p.id === a.id;
        }),
        "Dynamic palette is read-only"
      );
      app.paletteService.deletePaletteById(a.id);
      return { id: a.id };
    });
    register(
      "tool.list",
      "{}",
      "Discover all drawing tools and transformations.",
      function () {
        return {
          drawing: app.toolController.tools.map(function (t) {
            return t.toolId;
          }),
          transforms: app.transformationsController.tools.map(function (t) {
            return t.toolId;
          })
        };
      }
    );
    register(
      "tool.select",
      "{id}",
      "Select an existing drawing tool in the UI.",
      function (a) {
        assert(
          app.toolController.tools.some(function (t) {
            return t.toolId === a.id;
          }),
          "Unknown tool"
        );
        $.publish(Events.SELECT_TOOL, [a.id]);
        return state();
      }
    );
    register(
      "tool.colors",
      "{primary?,secondary?}",
      "Set drawing colors.",
      function (a) {
        var primary = a.primary === undefined ? undefined : color(a.primary);
        var secondary =
          a.secondary === undefined ? undefined : color(a.secondary);
        if (primary !== undefined) {
          $.publish(Events.PRIMARY_COLOR_SELECTED, [primary]);
        }
        if (secondary !== undefined) {
          $.publish(Events.SECONDARY_COLOR_SELECTED, [secondary]);
        }
        return state();
      }
    );
    register("tool.penSize", "{size}", "Set pen size 1..32.", function (a) {
      app.penSizeService.setPenSize(integer(a.size, 1, 32, "size"));
      return state();
    });
    register(
      "transform.apply",
      "{id,shiftKey=false,ctrlKey=false,altKey=false}",
      "Apply built-in transform to current selection, using UI modifier semantics.",
      function (a) {
        assert(
          app.transformationsController.tools.some(function (t) {
            return t.toolId === a.id;
          }),
          "Unknown transform"
        );
        app.transformationsController.applyTool(a.id, {
          shiftKey: !!a.shiftKey,
          ctrlKey: !!a.ctrlKey,
          altKey: !!a.altKey
        });
        return state();
      }
    );
    ["undo", "redo"].forEach(function (action) {
      register(
        "history." + action,
        "{}",
        "Await editor history restoration before next command.",
        function () {
          var h = app.historyService;
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
            // History service throttles rapid UI key repeats; API calls are already serialized.
            h.lastLoadState = 0;
            h[action]();
          });
        }
      );
    });

    register(
      "palette.select",
      "{id}",
      "Select a palette in the UI.",
      function (a) {
        assert(app.paletteService.getPaletteById(a.id), "Unknown palette");
        pskl.UserSettings.set(pskl.UserSettings.SELECTED_PALETTE, a.id);
        return { id: a.id };
      }
    );
    register(
      "settings.read",
      "{}",
      "Read all editor preferences.",
      function () {
        var values = {};
        Object.keys(pskl.UserSettings.KEY_TO_DEFAULT_VALUE_MAP_).forEach(
          function (key) {
            values[key] = pskl.UserSettings.get(key);
          }
        );
        return JSON.parse(JSON.stringify(values));
      }
    );
    register(
      "settings.set",
      "{key,value}",
      "Set supported boolean view preferences or grid dimensions.",
      function (a) {
        var booleans = [
          "GRID_ENABLED",
          "SEAMLESS_MODE",
          "ONION_SKIN",
          "LAYER_PREVIEW",
          "TRANSFORM_SHOW_MORE",
          "EXPORT_GIF_REPEAT"
        ];
        if (booleans.indexOf(a.key) !== -1) {
          assert(typeof a.value === "boolean", "value must be boolean");
        } else if (a.key === "GRID_WIDTH" || a.key === "GRID_SPACING") {
          integer(a.value, 1, 256, "value");
        } else {
          throw new Error(
            "Unsupported setting; use dedicated palette/tool/document commands"
          );
        }
        pskl.UserSettings.set(a.key, a.value);
        return { key: a.key, value: a.value };
      }
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
      }
    );
    register(
      "selection.read",
      "{}",
      "Read selected pixels, or null.",
      function () {
        var selection = app.selectionManager.currentSelection;
        return selection ? JSON.parse(JSON.stringify(selection.pixels)) : null;
      }
    );
    register(
      "selection.commit",
      "{}",
      "Commit floating selection.",
      function () {
        app.selectionManager.commit();
        return state();
      }
    );
    register("selection.erase", "{}", "Erase selected pixels.", function () {
      assert(app.selectionManager.currentSelection, "No selection");
      app.selectionManager.erase();
      return state();
    });
    return api;
  };
})();
