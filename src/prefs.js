/* -*- mode: js2; js2-basic-offset: 4; c-basic-offset: 4; tab-width: 4; indent-tabs-mode: nil -*-  */
/*
 * YAWL (Yet Another Window List) Gnome-Shell Extension
 *
 * Copyright (C) 2013 Vadim Cherepanov @ dbFin <vadim@dbfin.com>
 *
 * Yet Another Window List (YAWL) Gnome-Shell extension is
 * free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License (GPL)
 * as published by the Free Software Foundation, version 3
 * of the License, or any later version.
 *
 * YAWL is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY: without even implied warranty
 * of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the License (in file
 * GNUGPLv3) along with the program. A copy of the License
 * is also available at <http://www.gnu.org/licenses/>.
 *
 * prefs.js
 * Extension preferences interface and stuff.
 *
 */

const Lang = imports.lang;
const Mainloop = imports.mainloop;

const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const Convenience = Me.imports.convenience2;
const dbFinClickMeter = Me.imports.dbfinclickmeter;
const dbFinConsts = Me.imports.dbfinconsts;
const dbFinSettings = Me.imports.dbfinsettings;
const dbFinSignals = Me.imports.dbfinsignals;
const dbFinUtilsPrefs = Me.imports.dbfinutilsprefs;

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

const _D = Me.imports.dbfindebug._D;

function init() {
    Convenience.initTranslations();
}

// TODO: something more "sophisticated"?
const dbFinClicksThreshold = new Lang.Class({
    Name: 'dbFin.ClicksThreshold',

    _init: function() {
        this._signals = new dbFinSignals.dbFinSignals();
		this._settings = Convenience.getSettings();

        this._scaleSingle = null;
        this._scaleDouble = null;
        this._scaleThreshold = null;

		this._timeSingle = [];
		let (time = dbFinSettings.dbFinSettings.prototype.parseInt('mouse-clicks-time-single', 400, { min: 250, max: 750 }, this._settings)) {
			for (let i = 0; i < 14; ++i) this._timeSingle[i] = time;
		}
		this._timeDouble = [];
		let (time = dbFinSettings.dbFinSettings.prototype.parseInt('mouse-clicks-time-double', 250, { min: 100, max: 450 }, this._settings)) {
			for (let i = 0; i < 14; ++i) this._timeDouble[i] = time;
		}

        this._signals.connectNoId({ emitter: this._settings, signal: 'changed::mouse-clicks-time-single',
                                    callback: this._updateThreshold, scope: this });
        this._signals.connectNoId({ emitter: this._settings, signal: 'changed::mouse-clicks-time-double',
                                    callback: this._updateThreshold, scope: this });
    },

    destroy: function() {
        if (this._signals) {
            this._signals.destroy();
            this._signals = null;
        }
        this._settings = null;
    },

	set scaleSingle(scale) {
		this._scaleSingle = scale;
		this._signals.disconnectId('scale-single-value-changed');
		if (this._scaleSingle) {
			this._signals.connectId('scale-single-value-changed', {	emitter: this._scaleSingle, signal: 'value-changed',
                                                                    callback: this._updateThreshold, scope: this });
		}
	},

	set scaleDouble(scale) {
		this._scaleDouble = scale;
		this._signals.disconnectId('scale-double-value-changed');
		if (this._scaleDouble) {
			this._signals.connectId('scale-double-value-changed', {	emitter: this._scaleDouble, signal: 'value-changed',
                                                                    callback: this._updateThreshold, scope: this });
		}
	},

	set scaleThreshold(scale) {
		this._scaleThreshold = scale;
	},

	_updateThreshold: function() {
		if (!this || !this._scaleSingle || !this._scaleDouble || !this._scaleThreshold) return;
		let (s = this._scaleSingle.get_value(), d = this._scaleDouble.get_value()) {
			if (s && d) {
				let (v = Math.floor(Math.max(d * 8 / 7, s * 1 / 3 + d * 2 / 3))) {
					if (v !== this._scaleThreshold.get_value()) try { this._scaleThreshold.set_value(v); } catch(e) {}
				}
			}
		}
	},

    clickSingle: function(time) {
		if (this._timeSingle && this._timeSingle.length > 1) {
			this._timeSingle.pop();
			this._timeSingle.unshift(time);
			// not efficient, but might be for small arrays
			let (	heap = this._timeSingle.slice().sort(function(a, b) { return a - b; }).slice(0, this._timeSingle.length >> 1),
			     	sum = 0) {
				heap.forEach(function (t) { sum += t; });
				let (v = Math.floor(sum / heap.length)) {
					if (this._scaleSingle && v !== this._scaleSingle.get_value()) this._scaleSingle.set_value(v);
				}
			}
		}
    },

    clickDouble: function(time) {
		if (this._timeDouble && this._timeDouble.length > 1) {
			this._timeDouble.pop();
			this._timeDouble.unshift(time);
			// not efficient, but might be for small arrays
			let (	heap = this._timeDouble.slice().sort(function(a, b) { return b - a; }).slice(0, this._timeDouble.length >> 1),
			     	sum = 0) {
				heap.forEach(function (t) { sum += t; });
				let (v = Math.floor(sum / heap.length)) {
					if (this._scaleDouble && v !== this._scaleDouble.get_value()) this._scaleDouble.set_value(v);
				}
			}
		}
    }
});

const dbFinSettingsExportImport = new Lang.Class({
	Name: 'dbFin.SettingsExportImport',

	_init: function(gtkButtonExport, gtkButtonImport, gtkFileChooser, gtkLabelStatus) {
        this._signals = new dbFinSignals.dbFinSignals();
		this._settings = Convenience.getSettings();

		if (gtkButtonExport) {
			this._gtkButtonExport = gtkButtonExport;
			this._signals.connectNoId({	emitter: gtkButtonExport, signal: 'clicked',
					 					callback: this.doExport, scope: this });
		}
		if (gtkButtonImport) {
			this._gtkButtonImport = gtkButtonImport;
			this._signals.connectNoId({	emitter: gtkButtonImport, signal: 'clicked',
					 					callback: this.doImport, scope: this });
		}
		if (gtkFileChooser) {
			this._gtkFileChooser = gtkFileChooser;
		}
		if (gtkLabelStatus) {
			this._gtkLabelStatus = gtkLabelStatus;
			gtkLabelStatus.label = '';
		}
		this._timeoutStatus = null;
	},

	destroy: function() {
        if (this._signals) {
            this._signals.destroy();
            this._signals = null;
        }
		this._cancelTimeoutStatus();
		this._gtkButtonExport = null;
		this._gtkButtonImport = null;
		this._gtkFileChooser = null;
		this._gtkLabelStatus = null;
        this._settings = null;
	},

	doExport: function() {
		if (!this._gtkFileChooser || !this._settings) return;
		let (pf = this._gtkFileChooser.get_filename()) {
			try {
				if (!pf) throw _("Please specify settings file name.");
				let (s = '', groups = {}, groupsArray = [], gf = null, gfos = null, gbos = null) {
					dbFinConsts.Settings.forEach(function (ss) {
						if (ss[3]) {
							if (groups[ss[3]] === undefined) {
								groups[ss[3]] = [];
								groupsArray.push(ss[3]);
							}
							groups[ss[3]].push(ss[0]);
						}
					});
					groupsArray.sort();
					groupsArray.forEach(Lang.bind(this, function (g) {
						if (s) s += '\n';
						s += '[' + g + ']\n';
						groups[g].forEach(Lang.bind(this, function (k) {
							if (this._settings.list_keys().indexOf(k) == -1) return;
							let (v = this._settings.get_value(k)) {
								let (t = v.get_type_string(), vs = '') {
									if (t == 's') vs = v.get_string()[0];
									else if (t == 'b') vs = (v.get_boolean() ? '+' : '-');
									if (vs) s += k + '\t' + t + '\t' + vs + '\n';
								} // let (t, vs)
							} // let (v)
						})); // groups[g].forEach(k)
					})); // groupsArray.forEach(g)
					if (!(gf = Gio.file_new_for_path(pf))) throw _("Cannot create Gio.File object for file ") + pf + '.';
					if (!(gfos = gf.replace(/* etag = */null,
											/* make_backup = */true,
											/* flags = */Gio.FileCreateFlags.NONE,
											/* cancellable = */null))) {
						// typically, this throws its own exception if something goes wrong, but just in case...
						throw _("Cannot create/replace file ") + pf + '.';
					}
					if (!(gbos = Gio.DataOutputStream.new(/* base_stream = */gfos))) throw _("Cannot create Gio.DataOutputStream object for file ") + pf + '.';
					if (!gbos.put_string(/* str = */s + '\n',
										 /* cancellable = */null)) throw _("Cannot write to file ") + pf + '.';
					if (gbos) {
						gbos.close(null);
					}
					this._updateStatus(_("File was created/updated successfully!"), '#dfa');
				} // let (s, groups, groupsArray, gf, gfos, gbos)
			} // try
			catch (e) {
				if (e.message) this._updateStatus(e.message, '#faa');
				else this._updateStatus('' + e, '#faa');
			} // try catch (e)
		} // let (pf)
	},

	doImport: function() {
		if (!this._gtkFileChooser || !this._settings) return;
		let (pf = this._gtkFileChooser.get_filename()) {
			try {
				if (!pf) throw _("Please specify settings file name.");
				let (s = '', keys = this._settings.list_keys(), imported = 0, gf = null, gfis = null, gbis = null) {
					if (!(gf = Gio.file_new_for_path(pf))) throw _("Cannot create Gio.File object for file ") + pf + '.';
					if (!(gfis = gf.read(/* cancellable = */null))) throw _("Cannot open file ") + pf + '.';
					if (!(gbis = Gio.DataInputStream.new(/* base_stream = */gfis))) throw _("Cannot create Gio.DataInputStream object for file ") + pf + '.';
					while ((s = gbis.read_line(/* cancellable = */null)[0]) !== null) { // read line returns NULL at the end
						let (res = /(.*?)\t(.*?)\t(.*)/.exec(s)) {
							if (!res) continue;
							let (k = res[1], t = res[2], v = res[3]) {
								if (k && t && v && keys.indexOf(k) != -1) {
									++imported;
									if (t == 's') this._settings.set_string(k, v);
									else if (t == 'b') this._settings.set_boolean(k, v == '+');
									else --imported;
								}
							}
						}
					}
					if (gbis) {
						gbis.close(null);
					}
					this._updateStatus(_("File was read successfully") + ': ' + imported + ' ' + _("settings values imported."), '#dfa');
				} // let (s, keys, imported, gf, gfis, gbis)
			} // try
			catch (e) {
				if (e.message) this._updateStatus(e.message, '#faa');
				else this._updateStatus('' + e, '#faa');
			} // try catch (e)
		} // let (pf)
	},

	_cancelTimeoutStatus: function() {
		if (this._timeoutStatus) {
			Mainloop.source_remove(this._timeoutStatus);
			this._timeoutStatus = null;
		}
	},

	_updateStatus: function(msg, color) {
		this._cancelTimeoutStatus();
		if (!this._gtkLabelStatus) return;
		msg = msg || '';
		if (color) this._gtkLabelStatus.set_markup('<span background="' + color + '">   ' + msg + '   </span>');
		else this._gtkLabelStatus.set_markup('<span>   ' + msg + '   </span>');
		if (msg || color) this._timeoutStatus = Mainloop.timeout_add(2222, Lang.bind(this, function() { this._updateStatus(); }));
	}
});

function buildPrefsWidget() {
    _D('@'); // supress all debugging
    let (builder = new dbFinUtilsPrefs.dbFinSettingsWidgetBuilder(),
         widgets = null) {

        builder.addNotebook(_("Welcome"));
			widgets = builder.addWidget(Gtk.Image.new_from_file(Me.path + '/images/yawl.png'), 0, 0, 3, 7);
			if (widgets && widgets.length) {
				widgets[0].hexpand = true;
				widgets[0].vexpand = true;
				widgets[0].xalign = 0.5;
				widgets[0].yalign = 0.5;
			}
			widgets = builder.addWidget(Gtk.Image.new_from_file(Me.path + '/images/gplv3.png'), 9, 10, 1, 2);
			if (widgets && widgets.length) {
				widgets[0].hexpand = true;
				widgets[0].vexpand = true;
				widgets[0].xalign = 1.0;
				widgets[0].yalign = 0.0;
			}

			widgets = builder.addRow(null, [ [ new Gtk.Label({ halign: Gtk.Align.START }), 6 ], [ new Gtk.Label({ halign: Gtk.Align.END }), 1 ] ]);
			if (widgets && widgets.length) {
				widgets[0].set_markup('<span size="x-large"><span color="#347">Y</span>et <span color="#347">A</span>nother <span color="#347">W</span>indow <span color="#347">L</span>ist</span>');
				widgets[1].set_markup('v' + Me.metadata.version);
			}
			widgets = builder.addRow(null, [ [ new Gtk.Label({ halign: Gtk.Align.START }), 7 ] ]);
			if (widgets && widgets.length) widgets[0].set_markup('<span size="large">' + _("Gnome-Shell Extension") + '</span>');
			widgets = builder.addRow(null, [ [ new Gtk.Separator({ hexpand: true }), 7 ] ]);
			widgets = builder.addRow(null, [ [ new Gtk.Label({ halign: Gtk.Align.START }), 7 ] ]);
			if (widgets && widgets.length) widgets[0].set_markup(_("Copyright &#169; 2013 Vadim Cherepanov @ dbFin <a href='mailto:vadim@dbfin.com'><span underline='none'>&lt;vadim@dbfin.com&gt;</span></a>"));
			widgets = builder.addRow(null, [ [ new Gtk.Separator({ hexpand: true }), 7 ] ]);
			widgets = builder.addRow(null, [ [ new Gtk.Label({ halign: Gtk.Align.START }), 7 ] ]);
			if (widgets && widgets.length) widgets[0].set_markup(_("Home page:\t<a href='http://dbfin.com/yawl'><span underline='none'>http://dbfin.com/yawl</span></a>"));
			widgets = builder.addRow(null, [ [ new Gtk.Label({ halign: Gtk.Align.START }), 7 ] ]);
			if (widgets && widgets.length) widgets[0].set_markup(_("Source code:\t<a href='https://github.com/dbfin/gnome-shell-extension-yawl'><span underline='none'>https://github.com/dbfin/gnome-shell-extension-yawl</span></a>"));

			widgets = builder.addRow(null, [ [ new Gtk.Label({ halign: Gtk.Align.START }), 10 ] ]);
			if (widgets && widgets.length) widgets[0].set_markup('<span size="small"> </span>');
			widgets = builder.addRow(null, [ [ new Gtk.Label({ halign: Gtk.Align.START }), 10 ] ]);
			if (widgets && widgets.length) widgets[0].set_markup(_("Please report problems on GitHub. If you would like to translate the program to your language please email me."));

			builder.addSeparator();
			widgets = builder.addRow(null, [ [ new Gtk.Label({ justify: 3, halign: Gtk.Align.START }), 9 ], [ null, 1 ] ]);
			if (widgets && widgets.length) widgets[0].set_markup('<span size="small">' + _("This is free software -- free as in beer and free as in freeman -- distributed under the terms of the GNU General Public License (GPL) version 3.") + '</span>');
			widgets = builder.addRow(null, [ [ new Gtk.Label({ justify: 3, halign: Gtk.Align.START }), 9 ], [ null, 1 ] ]);
			if (widgets && widgets.length) widgets[0].set_markup('<span size="small">' + _("A copy of the License is distributed along with the software (file GNUGPLv3) and is also available at <a href='http://www.gnu.org/licenses/'><span color='#000000' underline='none'>http://www.gnu.org/licenses/gpl.html</span></a>.") + '</span>');
			widgets = builder.addRow(null, [ [ new Gtk.Label({ justify: 3, halign: Gtk.Align.START }), 10 ] ]);
			if (widgets && widgets.length) {
				widgets[0].set_line_wrap(true);
				widgets[0].set_markup('<span size="small">' + _("You are free to use, modify or otherwise distribute the code of this software provided that your actions comply with all applicable laws and GPL.") + '</span>'
							  + ' ' + '<span size="small">' + _("In particular, you must include the above copyright notice and a copy of the License in all copies or substantial portions of the software, whether original or modified.") + '</span>');
			}
			widgets = builder.addRow(null, [ [ new Gtk.Label({ justify: 3, halign: Gtk.Align.START }), 10 ] ]);
			if (widgets && widgets.length) {
				widgets[0].set_line_wrap(true);
				widgets[0].set_markup('<span size="small">' + _("This software is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY: without even implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.") + '</span>'
							  + ' ' + '<span size="small">' + _("For more details please see the GNU General Public License (GPL) version 3.") + '</span>');
			}

		builder.addPage(_("Icons"));
            builder.addNotebook(_("Panel"), 'panel.png');
                builder.addScaleScale(_("YAWL-panel position and width"), 'yawl-panel-position', 'yawl-panel-width', 0, 50, 1, 1, 100, 1);
                builder.addSeparator();
                builder.addCheckBox(_("Move central panel"), 'move-center');
                builder.addCheckBox(_("Hide Activities button"), 'hide-activities');
                builder.shift();
                    builder.addCheckBox(_("Preserve Hot Corner"), 'preserve-hot-corner', 'hide-activities');
                builder.unshift();
                builder.addCheckBox(_("Hide AppMenu button"), 'hide-app-menu');
                builder.addSeparator();
                builder.addCheckBox(_("Custom panel background"), 'panel-background');
                builder.shift();
                    builder.addColorButtonScale(_("Top color and opacity"), 'panel-top-color', 'panel-top-opacity', _("Choose panel background color"), 0, 100, 1, 'panel-background');
                    builder.addColorButtonScale(_("Bottom color and opacity"), 'panel-color', 'panel-opacity', _("Choose panel background color"), 0, 100, 1, 'panel-background');
                builder.unshift();

            builder.addPage(_("Icons"), 'icon.png');
                builder.addScale(_("Icon size"), 'icons-size', 16, 96, 8);
                builder.addCheckBox(_("Faded icons"), 'icons-faded');
				builder.addScale(_("Default icon opacity"), 'icons-opacity', 50, 100, 1);
                builder.addSeparator();
                builder.addScale(_("Clip icons: top (px)"), 'icons-clip-top', 0, 7, 1);
                builder.addScale(_("Clip icons: bottom (px)"), 'icons-clip-bottom', 0, 7, 1);
                builder.addSeparator();
                builder.addScale(_("Align icons on the panel (%)"), 'icons-align', 0, 100, 1);
                builder.addScale(_("Distance between icons\n(% of icon size)"), 'icons-distance', 0, 100, 1);

            builder.addPage(_("Animation"), 'animation.png');
                builder.addScale(_("Animation time in ms (0: no animation)"), 'icons-animation-time', 0, 1000, 1, null, true);
                builder.addComboBoxText(_("Animation effect"), 'icons-animation-effect', dbFinConsts.arrayAnimationTransitions, 0);
                builder.addSeparator();
				builder.addCheckBox(_("Animate icons on mouse over"), 'icons-hover-animation');
				builder.shift();
					builder.addScale(_("Change size (%)"), 'icons-hover-size', 100, 200, 1, 'icons-hover-animation');
					builder.addScale(_("Change opacity"), 'icons-hover-opacity', 50, 100, 1, 'icons-hover-animation');
					builder.addCheckBox(_("Show full width if partially hidden"), 'icons-hover-fit', 'icons-hover-animation');
	                builder.addSeparator();
	                builder.addScale(_("Mouse over animation time\n(% of animation time)"), 'icons-hover-animation-time', 0, 200, 1, 'icons-hover-animation');
                    builder.addComboBoxText(_("Mouse over animation effect"), 'icons-hover-animation-effect', dbFinConsts.arrayAnimationTransitions, 0, 'icons-hover-animation');
				builder.unshift();

            builder.closeNotebook();

		builder.addPage(_("Thumbnails"));
			builder.addNotebook(_("Panel"), 'panel_thumbnail.png');
                builder.addCheckBox(_("Use arrow-style thumbnails app indicator"), 'windows-indicator-arrow');
                builder.addCheckBox(_("Preview window when its thumbnail is hovered"), 'windows-preview');
                builder.addSeparator();
                builder.addCheckBox(_("Customize thumbnail panel theme"), 'windows-theming');
                builder.shift();
                    builder.addCheckBox(_("Match main panel background"), 'windows-background-panel', 'windows-theming');
					builder.addColorButtonScale(_("Background color and opacity"), 'windows-background-color', 'windows-background-opacity', _("Choose thumbnail panel background color"), 0, 100, 1, [ 'windows-theming', '!windows-background-panel' ]);
					builder.addColorButtonScale(_("Text color and size"), 'windows-text-color', 'windows-text-size', _("Choose thumbnail panel text color"), 6, 36, 1, 'windows-theming');
                    builder.addScale(_("Padding"), 'windows-padding', 0, 20, 1, 'windows-theming');
                    builder.addColorButtonScale(_("Border color and width"), 'windows-border-color', 'windows-border-width', _("Choose thumbnail panel border color"), 0, 3, 1, 'windows-theming');
                    builder.addScale(_("Border radius"), 'windows-border-radius', 0, 10, 1, 'windows-theming');
                builder.unshift();

			builder.addPage(_("Thumbnails"), 'thumbnail.png');
                builder.addCheckBox(_("Same height thumbnails"), 'windows-thumbnails-fit-height');
                builder.addScale(_("Thumbnail maximum width"), 'windows-thumbnails-width', 50, 500, 25, '!windows-thumbnails-fit-height', true);
				builder.addScale(_("Thumbnail maximum height"), 'windows-thumbnails-height', 40, 400, 20, null, true);
                builder.addScale(_("Thumbnail maximum visible height"), 'windows-thumbnails-height-visible', 40, 400, 20, null, true);
                builder.addSeparator();
				builder.addScale(_("Default thumbnail opacity"), 'windows-thumbnails-opacity', 50, 100, 1);
				builder.addScale(_("Minimized thumbnail opacity"), 'windows-thumbnails-minimized-opacity', 10, 100, 1);
                builder.addSeparator();
                builder.addScale(_("Distance between thumbnails\n(% of thumbnail size)"), 'windows-thumbnails-distance', 0, 50, 1);
                builder.addScale(_("Thumbnail top padding (px)"), 'windows-thumbnails-padding-top', 0, 20, 1);

			builder.addPage(_("Animation"), 'animation_thumbnail.png');
                builder.addScale(_("Thumbnails show delay in ms"), 'windows-show-delay', 0, 1000, 1, null, true);
                builder.addScale(_("Animation time in ms (0: no animation)"), 'windows-animation-time', 0, 1000, 1, null, true);
                builder.addComboBoxText(_("Animation effect"), 'windows-animation-effect', dbFinConsts.arrayAnimationTransitions, 0);
                builder.addSeparator();
				builder.addLabel(_("Animate thumbnails on mouse over"));
                builder.shift();
					builder.addScale(_("Change opacity"), 'windows-hover-opacity', 50, 100, 1);
					builder.addCheckBox(_("Show full width if partially hidden"), 'windows-hover-fit');
	                builder.addSeparator();
	                builder.addScale(_("Mouse over animation time\n(% of animation time)"), 'windows-hover-animation-time', 0, 200, 1);
                    builder.addComboBoxText(_("Mouse over animation effect"), 'windows-hover-animation-effect', dbFinConsts.arrayAnimationTransitions, 0);
                builder.unshift();

            builder.closeNotebook();

        builder.addPage(_("Behavior"));
            builder.addNotebook(_("Mouse"), 'mouse.png');
                builder.addNotebook(_("Icons: left button"), 'mouse-left.png');
                    builder.addComboBoxText(_("Click : Double click"), 'mouse-app-left', dbFinConsts.arrayAppClickFunctions, 0);
                    builder.addComboBoxText(_("Ctrl + Click : Double click"), 'mouse-app-left-ctrl', dbFinConsts.arrayAppClickFunctions, 0);
                    builder.addComboBoxText(_("Shift + Click : Double click"), 'mouse-app-left-shift', dbFinConsts.arrayAppClickFunctions, 0);
                    builder.addComboBoxText(_("Ctrl + Shift + Click : Double click"), 'mouse-app-left-ctrl-shift', dbFinConsts.arrayAppClickFunctions, 0);
	                builder.addSeparator();
					builder.addLabel(_("Long left button click emulates right button click (useful for touch screens)"));
                    builder.shift();
						builder.addLabel(_("\u26a0 This will work only if option 'Fine-tuning \u2192 Mouse events on button release' is enabled"));
    	                builder.addCheckBox(_("Long left button click = right button click"), 'mouse-long-click', 'mouse-click-release');
                    builder.unshift();

                builder.addPage(_("Icons: middle button"), 'mouse-middle.png');
                    builder.addComboBoxText(_("Click : Double click"), 'mouse-app-middle', dbFinConsts.arrayAppClickFunctions, 0);
                    builder.addComboBoxText(_("Ctrl + Click : Double click"), 'mouse-app-middle-ctrl', dbFinConsts.arrayAppClickFunctions, 0);
                    builder.addComboBoxText(_("Shift + Click : Double click"), 'mouse-app-middle-shift', dbFinConsts.arrayAppClickFunctions, 0);
                    builder.addComboBoxText(_("Ctrl + Shift + Click : Double click"), 'mouse-app-middle-ctrl-shift', dbFinConsts.arrayAppClickFunctions, 0);
	                builder.addSeparator();
                    builder.addComboBoxText(_("Scroll up : down"), 'mouse-app-scroll', dbFinConsts.arrayAppClickFunctions, 0);

                builder.addPage(_("Thumbnails"), 'thumbnail_16.png');
                    builder.addComboBoxText(_("Left button Click"), 'mouse-window-left', dbFinConsts.arrayWindowClickFunctions, 0);
                    builder.addComboBoxText(_("Left button Ctrl + Click"), 'mouse-window-left-ctrl', dbFinConsts.arrayWindowClickFunctions, 0);
                    builder.addComboBoxText(_("Left button Shift + Click"), 'mouse-window-left-shift', dbFinConsts.arrayWindowClickFunctions, 0);
                    builder.addComboBoxText(_("Left button Ctrl + Shift + Click"), 'mouse-window-left-ctrl-shift', dbFinConsts.arrayWindowClickFunctions, 0);
	                builder.addSeparator();
                    builder.addComboBoxText(_("Middle button Click"), 'mouse-window-middle', dbFinConsts.arrayWindowClickFunctions, 0);
                    builder.addComboBoxText(_("Scroll"), 'mouse-window-scroll', dbFinConsts.arrayWindowClickFunctions, 0);
	                builder.addSeparator();
                    builder.addComboBoxText(_("Right button Click"), 'mouse-window-right', dbFinConsts.arrayWindowClickFunctions, 0);

                builder.addPage(_("Fine-tuning"), 'tuning.png');
	                builder.addCheckBox(_("Mouse events on button release\n(default for Gnome-Shell is off)"), 'mouse-click-release');
	                builder.addSeparator();
                    let threshold = new dbFinClicksThreshold();
                    builder.getWidget()._threshold = threshold;
					builder.addLabel(_("This will measure the SHORTEST time between two consecutive SINGLE clicks."));
					builder.shift();
						widgets = builder.addRow(_("Make a fast series of SINGLE clicks"),
									   [	[ Gtk.Image.new_from_file(Me.path + '/images/mouse-clicks-single.gif'), 1 ],
											[ new Gtk.Label({ label: _("here") + '  \u2192 ', halign: Gtk.Align.END, hexpand: false }), 1 ],
											[ (new dbFinClickMeter.dbFinClickMeter(250, 625, threshold.clickSingle, threshold)).widget, 2 ]
										]);
	                    if (widgets && widgets.length) { widgets[1].hexpand = true; widgets[1].xalign = 0.0; }
	                    widgets = builder.addScale(_("Consequent single clicks time:"), 'mouse-clicks-time-single', 250, 750, 1, null, true);
	                    if (widgets && widgets.length) threshold.scaleSingle = widgets[widgets.length - 1];
					builder.unshift();
					builder.addLabel(_("This will measure the LONGEST time between the two clicks of one DOUBLE click."));
					builder.shift();
						widgets = builder.addRow(_("Make a series of DOUBLE clicks"),
									   [	[ Gtk.Image.new_from_file(Me.path + '/images/mouse-clicks-double.gif'), 1 ],
											[ new Gtk.Label({ label: _("here") + '  \u2192 ', halign: Gtk.Align.END, hexpand: false }), 1 ],
											[ (new dbFinClickMeter.dbFinClickMeter(100, 400, threshold.clickDouble, threshold)).widget, 2 ]
										]);
	                    if (widgets && widgets.length) { widgets[1].hexpand = true; widgets[1].xalign = 0.0; }
	                    widgets = builder.addScale(_("Double clicks time:"), 'mouse-clicks-time-double', 100, 450, 1, null, true);
	                    if (widgets && widgets.length) threshold.scaleDouble = widgets[widgets.length - 1];
					builder.unshift();
					builder.addLabel(_("Based on the data provided above we set the following value (you can adjust it manually):"));
					builder.shift();
	                    widgets = builder.addScale(_("Single/Double clicks threshold:"), 'mouse-clicks-time-threshold', 150, 550, 1);
					builder.unshift();
                    if (widgets && widgets.length) threshold.scaleThreshold = widgets[widgets.length - 1];

                builder.closeNotebook();

			builder.addPage(_("Debug"), 'debug.png');
				builder.addLabel(_("These options are for developers only."));
				builder.addSeparator();
				builder.addLabel(_("Debugging panel shows a hierarchical structure of internal function calls... Is that right?"));
				builder.addLabel(_("The panel has a small toolbar which allows one to:"));
				builder.shift();
					builder.addLabel('\u00b7 ' + _("pin the panel (so that it is always visible)"));
					builder.addLabel('\u00b7 ' + _("stop, resume and clear all messages"));
					builder.addLabel('\u00b7 ' + _("access extension preferences"));
					builder.addLabel('\u00b7 ' + _("restart the extension"));
				builder.unshift();
				builder.addCheckBox(_("Debugging panel"), 'debug');
				builder.shift();
					builder.addLabel(_("By default the panel is placed at the right side (of the last monitor)."), 'debug');
					builder.addCheckBox(_("Move the panel to the bottom left"), 'debug-bottom', 'debug');
					builder.addScale(_("Debug panel width\n(% of the monitor width)"), 'debug-width', 10, 70, 1, 'debug');
					builder.addCheckBox(_("Force all messages (\u26a0 ouch!)"), 'debug-force', 'debug');
				builder.unshift();

            builder.closeNotebook();

		builder.addPage(_("Export/Import"));
			widgets = builder.addRow(new Gtk.Label({ halign: Gtk.Align.START }));
			if (widgets && widgets.length) widgets[0].set_markup(_("Backup, sync and share settings. To download default and other settings please visit: <a href='http://dbfin.com/yawl'><span underline='none'>http://dbfin.com/yawl</span></a>"));
			let fcw = builder.addRow(new Gtk.FileChooserWidget({	action: Gtk.FileChooserAction.SAVE, create_folders: true,
																	do_overwrite_confirmation: false, select_multiple: false,
																	show_hidden: false, hexpand: true, vexpand: true,
																	halign: Gtk.Align.FILL, valign: Gtk.Align.FILL }));
			if (fcw && fcw.length) {
				fcw = fcw[0];
				fcw.set_current_folder('~');
				fcw.set_show_hidden(true);
				fcw.set_current_name('all.yawl.settings');
			}
			let status = builder.addRow(_("Status:"), [ [ new Gtk.Label({ label: '', halign: Gtk.Align.FILL }), 9 ] ]);
			status = status && status.length && status[1] || null;
			widgets = builder.addRow(null, [
									[ new Gtk.Label({ label: _("This will overwrite the file with settings"), halign: Gtk.Align.END }), 4 ],
									[ new Gtk.Button({ label: _("Export"), halign: Gtk.Align.FILL }), 1 ],
									[ new Gtk.Label({ label: _("This will overwrite all current settings"), halign: Gtk.Align.END }), 4 ],
									[ new Gtk.Button({ label: _("Import"), halign: Gtk.Align.FILL }), 1 ]
			                     ]);
			if (widgets && widgets.length) {
				let sei = new dbFinSettingsExportImport(widgets[1], widgets[3], fcw, status);
				builder.getWidget()._sei = sei;
			}

		builder.addPage(_("Did you know?"));
			widgets = builder.addRow(new Gtk.Label({ justify: 3, halign: Gtk.Align.START }));
			if (widgets && widgets.length) {
				widgets[0].set_line_wrap(true);
				widgets[0].set_markup(
								'YAWL (<span color="#347">Y</span>et <span color="#347">A</span>nother <span color="#347">W</span>indow <span color="#347">L</span>ist)'
						+ ' ' + _("is designed to be simple to use yet highly customizable.")
				);
			}
			builder.shift();
				widgets = builder.addRow(new Gtk.Label({ justify: 3, halign: Gtk.Align.START }));
				if (widgets && widgets.length) {
					widgets[0].set_line_wrap(true);
					widgets[0].set_markup('<span size="small">' +
								(Math.floor((dbFinConsts.Settings.length - 1) / 10) * 10) + '+'
						+ ' ' + _("settings are currently available to customize feel and look of the extension.")
						+ ' ' + _("Exploring the options also helps you to uncover some hidden features.")
						+ ' ' + _("For example, <b>did you know</b> that there is an option to preview a window when its thumbnail is hovered, and that you can easily switch it on and off just by scrolling the middle mouse button over the thumbnail?")
					+ '</span>');
				}
			builder.unshift();
			widgets = builder.addRow(new Gtk.Label({ justify: 3, halign: Gtk.Align.START }));
			if (widgets && widgets.length) {
				widgets[0].set_line_wrap(true);
				widgets[0].set_markup(
								'YAWL (<span color="#347">Y</span>et <span color="#347">A</span>nother <span color="#347">W</span>indow <span color="#347">L</span>ist)'
						+ ' ' + _("is workspace-centric.")
				);
			}
			builder.shift();
				widgets = builder.addRow(new Gtk.Label({ justify: 3, halign: Gtk.Align.START }));
				if (widgets && widgets.length) {
					widgets[0].set_line_wrap(true);
					widgets[0].set_markup('<span size="small">' +
								_("It shows apps and windows open on the current active workspace only.")
						+ ' ' + _("Most of its functionality (such as cycling through windows) is also active-workspace-oriented.")
						+ ' ' + _("This is intentional and was set as one of the initial goals.")
						+ ' ' + _("App icons shown on the panel are indicative of which workspace you are currently on and what task/activity it is intended for.")
						+ ' ' + _("If you also want quick access to all applications running on all workspaces and favorites")
						+ ' ' + _("please consider installing in addition this highly recommended extension:")
					    + ' ' + '<b>Dash to Dock</b> (' + _("author") + ': <b>michele_g</b>)'
					+ '</span>');
				}
			builder.unshift();
			widgets = builder.addRow(new Gtk.Label({ justify: 3, halign: Gtk.Align.START }));
			if (widgets && widgets.length) {
				widgets[0].set_line_wrap(true);
				widgets[0].set_markup(
								'YAWL (<span color="#347">Y</span>et <span color="#347">A</span>nother <span color="#347">W</span>indow <span color="#347">L</span>ist)'
						+ ' ' + _("tries to seamlessly integrate into the Gnome-Shell panel.")
				);
			}
			builder.shift();
				widgets = builder.addRow(new Gtk.Label({ justify: 3, halign: Gtk.Align.START }));
				if (widgets && widgets.length) {
					widgets[0].set_line_wrap(true);
					widgets[0].set_markup('<span size="small">' +
								_("It is embedded into the panel right where there is space for it not claimed by anything else, and uses panel theme by default.")
						+ ' ' + _("It further allows you to hide some unnecessary buttons on the left and shift the central panel to the right to give itself more space.")
						+ ' ' + _("You can tweak the panel even more by installing some of the following recommended extensions:")
						+ ' ' + '<b>Frippery Move Clock</b> (' + _("author") + ': <b>rmyorston</b>), <b>Status Area Horizontal Spacing</b> (' + _("author") + ': <b>mathematical.coffee</b>), <b>User Themes</b> (' + _("author") + ': <b>gcampax</b>)'
					+ '</span>');
				}
			builder.unshift();
			widgets = builder.addRow(new Gtk.Label({ justify: 3, halign: Gtk.Align.START }));
			if (widgets && widgets.length) {
				widgets[0].set_line_wrap(true);
				widgets[0].set_markup(
								'YAWL (<span color="#347">Y</span>et <span color="#347">A</span>nother <span color="#347">W</span>indow <span color="#347">L</span>ist)'
						+ ' ' + _("is a part of greater FOSS ")
				);
			}
			builder.shift();
				widgets = builder.addRow(new Gtk.Label({ justify: 3, halign: Gtk.Align.START }));
				if (widgets && widgets.length) {
					widgets[0].set_line_wrap(true);
					widgets[0].set_markup('<span size="small">' +
								_("And as such it is completely free to use, study, distribute and modify provided you acknowledge all the copyrights and your actions comply with the applicable law and GNU GPL.")
					+ '</span>');
				}
				widgets = builder.addRow(new Gtk.Label({ justify: 3, halign: Gtk.Align.START }));
				if (widgets && widgets.length) {
					widgets[0].set_line_wrap(true);
					widgets[0].set_markup('<span size="small">' +
								_("Your contribution in the form of feature suggestions, bug reports, translations, donations or even development is highly appreciated.")
					+ '</span>');
				}
				widgets = builder.addRow(new Gtk.Label({ justify: 3, halign: Gtk.Align.START }));
				if (widgets && widgets.length) {
					widgets[0].set_line_wrap(true);
					widgets[0].set_markup('<span size="small">' +
								_("The development of this extension would not be possible without this wonderful FOSS:")
						+ ' ' + 'Anjuta, Inkscape, Gimp, OmegaT, Ubuntu, Fedora ' + _("and, of course,") + ' Gnome-Shell!'
					+ '</span>');
				}
			builder.unshift();

        return builder.getWidget();
    } // let (builder, widgets)
}
