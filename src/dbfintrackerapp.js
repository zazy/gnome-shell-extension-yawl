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
 * dbfintrackerapp.js
 * App tracker.
 *
 */

const Cairo = imports.cairo;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Signals = imports.signals;

const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const Main = imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const dbFinAnimationEquations = Me.imports.dbfinanimationequations;
const dbFinAppButton = Me.imports.dbfinappbutton;
const dbFinSignals = Me.imports.dbfinsignals;
const dbFinSlicerLabel = Me.imports.dbfinslicerlabel;
const dbFinUtils = Me.imports.dbfinutils;
const dbFinYAWLPanel = Me.imports.dbfinyawlpanel;

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

const _D = Me.imports.dbfindebug._D;

/* class dbFinTrackerApp: all stuff associated with an app
 */
const dbFinTrackerApp = new Lang.Class({
	Name: 'dbFin.TrackerApp',

    _init: function(metaApp, tracker, state) {
        _D('>' + this.__name__ + '._init()');
		this._signals = new dbFinSignals.dbFinSignals();
		this.metaApp = metaApp;
		this._tracker = tracker;
        this.state = state || 0;
        this.windows = [];
        this.pin = false;

        this.appName = '?';
		if (this.metaApp && this.metaApp.get_name) {
			try { this.appName = this.metaApp.get_name(); } catch (e) { this.appName = '?'; }
		}

        this.yawlPanelWindowsGroup = new dbFinYAWLPanel.dbFinYAWLPanel({    hidden: true,
                                                                            showhidechildren: true,
                                                                            title: this.appName,
                                                                            label: '' });
        if (this.yawlPanelWindowsGroup) {
            if (global.yawl.panelWindows) global.yawl.panelWindows.addChild(this.yawlPanelWindowsGroup);
            this._updatedWindowsThumbnailsHeightVisible =
                    this._updatedWindowsThumbnailsPaddingTop = function () {
                if (this.yawlPanelWindowsGroup) {
                    this.yawlPanelWindowsGroup.maxChildHeight = global.yawl._windowsThumbnailsHeightVisible
                            + global.yawl._windowsThumbnailsPaddingTop;
                }
            };
        }

		this.hovered = false;

        this.appButton = new dbFinAppButton.dbFinAppButton(metaApp, this);
		if (this.appButton) {
			this._signals.connectId('app-button-destroy', {	emitter: this.appButton, signal: 'destroy',
															callback: this._onAppButtonDestroy, scope: this });
            if (global.yawl.panelApps) {
                global.yawl.panelApps.addChild(this.appButton);
                if (global.yawl.panelApps.container) {
                    this._signals.connectNoId({	emitter: global.yawl.panelApps.container, signal: 'notify::allocation',
                                                callback: this._appButtonAllocationChanged, scope: this });
                }
                if (global.yawl.panelApps.actor) {
                    this._signals.connectNoId({	emitter: global.yawl.panelApps.actor, signal: 'notify::allocation',
                                                callback: this._appButtonAllocationChanged, scope: this });
                }
            }
			if (this.appButton.container) {
				this._signals.connectNoId({	emitter: this.appButton.container, signal: 'notify::allocation',
											callback: this._appButtonAllocationChanged, scope: this });
			}
			if (this.appButton.actor) {
				if (global.yawl && global.yawl.menuBuilder && global.yawl.menuBuilder.menuWindowsManager) {
					this.appButton.menuWindows = global.yawl.menuBuilder.build(this, this.appButton.actor, true);
					if (this.appButton.menuWindows && this.appButton.menuWindows.actor) {
						Main.uiGroup.add_child(this.appButton.menuWindows.actor);
						this.appButton.menuWindows.actor.hide();
						this._menuWindowsManager = global.yawl.menuBuilder.menuWindowsManager;
						this._menuWindowsManager.addMenu(this.appButton.menuWindows);
						this._signals.connectNoId({	emitter: this.appButton.menuWindows, signal: 'open-state-changed',
													callback: this._menuToggled, scope: this });
					}
				}
				this._signals.connectNoId({ emitter: this.appButton.actor, signal: 'enter-event',
											callback: this._enterEvent, scope: this });
				this._signals.connectNoId({ emitter: this.appButton.actor, signal: 'leave-event',
											callback: this._leaveEvent, scope: this });
			}
            this._badgesWindowsNumber = null;
            this._badgesWindows = [];
        } // if (this.appButton)

        this._moveToStablePosition();

		this._menuManager = Main.panel && Main.panel.menuManager || null;
		this.updateMenu();
		if (this.metaApp) {
			this._signals.connectNoId({	emitter: this.metaApp, signal: 'notify::menu',
										callback: this.updateMenu, scope: this });
			this._signals.connectNoId({	emitter: this.metaApp, signal: 'notify::action-group',
										callback: this.updateMenu, scope: this });
		}

		this.focused = false;
		this._updateFocused();
		if (this._tracker && this._tracker.getTracker) {
			this._signals.connectNoId({	emitter: this._tracker.getTracker(), signal: 'notify::focus-app',
										callback: this._updateFocused, scope: this });
		}

        this._nextWindowsTimeout = null;
		this._resetNextWindows();

        this._showThumbnailsTimeout = null;

		this._createMenuTimeout = null;

		this._attentionTimeout = null;
		this.attention(!!(this._tracker && this._tracker.hasAppAttention(this.metaApp)));

		this._updatedIconsShowAll =
            this._updatedIconsOpacity =
            this._updatedIconsOpacityOther =
			this._updatedIconsOpacityInactive =
            this._updatedIconsFavorites =
            this._updatedIconsFavoritesSmaller = function () { this.updateVisibility(); };
        this._updatedWindowsShow = function () { if (global.yawl && !global.yawl._windowsShow) this.hideWindowsGroup(); }
        this._updatedWindowsAnimationTime = function () { if (this.yawlPanelWindowsGroup) this.yawlPanelWindowsGroup.animationTime = global.yawl._windowsAnimationTime; };
		this._updatedWindowsAnimationEffect = function () { if (this.yawlPanelWindowsGroup) this.yawlPanelWindowsGroup.animationEffect = global.yawl._windowsAnimationEffect; };
        this._updatedIconsAttentionBlink =
            this._updatedIconsAttentionBlinkRate = function () { this.attention(this._attention); }
        this._updatedAppQuicklists = function () { this.updateMenu(); }
        this._updatedIconsWindowsIndicator = function () { this.updateVisibility(); }
        this._updatedIconsWindowsIndicatorColor = function () { this._repaintWindowIndicators(); }

        global.yawl.watch(this);
        _D('<');
    },

	destroy: function() {
        _D('>' + this.__name__ + '.destroy()');
		if (this._signals) {
			this._signals.destroy();
			this._signals = null;
		}
        this._resetNextWindows();
        this._cancelShowThumbnailsTimeout();
		this._cancelCreateMenuTimeout();
        this.attention(false);
        if (this.appButton) {
			if (this.appButton.menuWindows) {
	            if (this._menuWindowsManager) this._menuWindowsManager.removeMenu(this.appButton.menuWindows);
				this.appButton.menuWindows.destroy();
				this.appButton.menuWindows = null;
			}
			this.appButton.setMenu(null);
            this.appButton.destroy();
            this.appButton = null;
        }
        this._destroyBadges(); // just in case they were not destroyed for some reason
        if (this.yawlPanelWindowsGroup) {
            this.yawlPanelWindowsGroup.destroy();
            this.yawlPanelWindowsGroup = null;
        }
        this._menuManager = null;
		this.focused = false;
		this.hovered = false;
		this.appName = '?';
        this.pin = false;
        this.windows = [];
		this._tracker = null;
		this.metaApp = null;
        this.emit('destroy');
        _D('<');
	},

    _destroyBadges: function() {
        _D('>' + this.__name__ + '._destroyBadges()');
        if (this._badgesWindows) {
            for (let i = this._badgesWindows.length; i--;) {
                if (this._signals) this._signals.disconnectId('window-indicator-' + i);
                if (this._badgesWindows[i]) {
                    this._badgesWindows[i].destroy();
                    this._badgesWindows[i] = null;
                }
            }
            this._badgesWindows = [];
        }
        if (this._badgesWindowsNumber) {
            this._badgesWindowsNumber.destroy();
            this._badgesWindowsNumber = null;
        }
        _D('<');
    },

    _onAppButtonDestroy: function() {
        _D('>' + this.__name__ + '._onAppButtonDestroy()');
		if (this._signals) {
			this._signals.disconnectId('app-button-destroy');
			this._signals.disconnectId('menu-toggled');
		}
        this.appButton = null;
        this._destroyBadges();
        _D('<');
    },

    _paintWindowIndicator: function(area) {
        _D('@' + this.__name__ + '._paintWindowIndicator()');
		if (!area || !area.get_stage()) {
			_D('<');
			return;
		}
		let ([ w, h ] = area.get_surface_size()) {
			if (w >= 1 && h >= 1) {
				let (cr = area.get_context(),
                     red = 255,
                     green = 255,
                     blue = 255,
                     rs = [ 1.5, (Math.min(w, h) - 1) / 2 ],
                     os = [ 0.77, 0.5 ],
                     effect = 1 / 5) {
                    if (global.yawl && global.yawl._iconsWindowsIndicatorColor) {
                        let (rgba_ = dbFinUtils.stringColorToRGBA(global.yawl._iconsWindowsIndicatorColor)) {
                            red = rgba_.red;
                            green = rgba_.green;
                            blue = rgba_.blue;
                        }
                    }
                    if (!Cairo.RadialGradient) {
                        cr.moveTo(w / 2, h / 2);
                        cr.arc(w / 2, h / 2, rs[0], 0, 2. * Math.PI);
                        cr.setLineWidth(1);
                        let (rgba = new Clutter.Color()) {
                            rgba.red = red;
                            rgba.green = green;
                            rgba.blue = blue;
                            rgba.alpha = Math.floor(255 * os[0]);
                            Clutter.cairo_set_source_color(cr, rgba);
                        }
                        cr.fill();
                    }
                    else {
                        red /= 255;
                        green /= 255;
                        blue /= 255;
                        for (let i = 0; i < rs.length; ++i) {
                            cr.moveTo(w / 2, h / 2);
                            cr.arc(w / 2, h / 2, rs[i], 0, 2. * Math.PI);
                            cr.setLineWidth(1);
                            let (gradient = new Cairo.RadialGradient(w / 2, h / 2, 0, w / 2, h / 2, rs[i])) {
                                gradient.addColorStopRGBA(0.0, 1, 1, 1, os[i]);
                                gradient.addColorStopRGBA(effect, 1 - effect * (1 - red), 1 - effect * (1 - green), 1 - effect * (1 - blue), Math.min(os[i], effect));
                                gradient.addColorStopRGBA(1.0, red, green, blue, 0.0);
                                cr.setSource(gradient);
                            }
                            cr.fill();
                        }
                    }
				} // let (cr, red, green, blue, rs, os, effect)
			} // if (w >= 1 && h >= 1)
		} // let ([w, h])
        _D('<');
    },

    _repaintWindowIndicators: function() {
        _D('>' + this.__name__ + '._repaintWindowIndicators()');
        if (this._badgesWindowsNumber && this._badgesWindowsNumber.actor
            && global.yawl && global.yawl._iconsWindowsIndicatorColor) {
            this._badgesWindowsNumber.actor.set_style('color: ' + global.yawl._iconsWindowsIndicatorColor);
        }
        if (this._badgesWindows) {
            for (let i = this._badgesWindows.length; i--;) {
                this._badgesWindows[i].queue_repaint();
            }
        }
        this.updateVisibility(); // just in case
        _D('<');
    },

	updateVisibility: function() {
        _D('>' + this.__name__ + '.updateVisibility()');
		if (!this.appButton) {
			_D('this.appButton === null');
			_D('<');
			return;
		}
        // if   ( something wrong )
        //      || ( app is stopped
        //           || not running
        //           || on other workspaces
        //              && we do not show all icons
        //         )
        //         &&
        //         ( app is not pinned
        //           || we do not show favorites
        //         )
        this.appButton.badgeHide('window-indicator-number');
        for (let i = 0; i < 5; ++i) {
            this.appButton.badgeHide('window-indicator-' + i);
        }
		if (    !this.metaApp || !this.state || !this.windows || !this._tracker || !global.yawl
                || (    this.metaApp.state == Shell.AppState.STOPPED
                        || this.state < this._tracker.state
                        || !this.windows.length
                           && !global.yawl._iconsShowAll
                   )
                   &&
                   (    !this.pin
                        || !global.yawl._iconsFavorites
                   )
           ) {
			this.appButton.hide();
			this.hideWindowsGroup();
		} // if ("app icon should be hidden")
		else let (indicatorType = global.yawl._iconsWindowsIndicator || 0,
                  stopped = this.metaApp.state == Shell.AppState.STOPPED
                            || this.state < this._tracker.state) {
			this.appButton.show();
			if (!this.windows.length) {
                if (this.appButton._slicerIcon) {
                    if (stopped) {
                        this.appButton._slicerIcon.setOpacity100(global.yawl._iconsOpacityInactive);
                        this.appButton._slicerIcon.setZoom(
                                global.yawl && global.yawl._iconsFavoritesSmaller
                                ?   global.yawl._iconsSize
                                    ?   dbFinUtils.inRange((global.yawl._iconsSize >> 1) + 4, 12, 24, 24)
                                        / global.yawl._iconsSize
                                    :   0.625
                                :   1
                        );
                    }
                    else {
                        this.appButton._slicerIcon.setOpacity100(global.yawl._iconsOpacityOther);
                        // https://www.wolframalpha.com/input/?i=real+roots+of+-8%2F27s^3%2F%28s%2B1%29^2%2B4%2F9s^3%2F%28s%2B1%29^2-0.5
                        this.appButton._slicerIcon.setZoom(
                                1,
                                (this.appButton._slicerIcon.animationTime || 0) * 2,
                                dbFinAnimationEquations.withParams(
                                        'easeInOutBack',
                                        { overshoot: 4.8948595225811 }
                                )
                        );
                    }
                }
				this.hideWindowsGroup();
				if (this.appButton.actor) {
	                this.appButton.actor.add_style_pseudo_class(stopped ? 'inactive' : 'other');
				}
			} // if (!this.windows.length)
            else {
                if (this.appButton._slicerIcon) {
                    this.appButton._slicerIcon.setOpacity100(global.yawl._iconsOpacity);
                    this.appButton._slicerIcon.setZoom(
                            1,
                            (this.appButton._slicerIcon.animationTime || 0) * 2,
                            dbFinAnimationEquations.withParams(
                                    'easeInOutBack',
                                    { overshoot: 4.8948595225811 }
                            )
                    );
                }
				if (this.appButton.actor) {
	                this.appButton.actor.remove_style_pseudo_class('other');
	                this.appButton.actor.remove_style_pseudo_class('inactive');
				}
                if (indicatorType == 2) {
                    if (!this._badgesWindowsNumber) {
                        this._badgesWindowsNumber = new dbFinSlicerLabel.dbFinSlicerLabel({ text: '' },
                                                        { style_class: 'badge-icon-windows-number' });
                        if (this._badgesWindowsNumber && this._badgesWindowsNumber.container) {
                            this.appButton.badgeAdd('window-indicator-number',
                                                    this._badgesWindowsNumber.container,
                                                    12,
                                                    undefined, undefined,
                                                    3, -global.yawl._iconsClipBottom || 0);
                        }
                    }
                    if (this._badgesWindowsNumber) {
                        this._badgesWindowsNumber.setText('' + this.windows.length);
                        this.appButton.badgeShow('window-indicator-number');
                    }
                } // if (indicatorType == 2)
                else if (indicatorType == 1) {
                    if (!this._badgesWindows || !this._badgesWindows.length) {
                        this._badgesWindows = [];
                        for (let i = 0, indicator = null;
                             i < 5 && (indicator = new St.DrawingArea({ style_class: 'badge-icon-windows' }));
                             ++i) {
                            indicator.width = indicator.height = 32;
                            this._signals.connectId('window-indicator-' + i, {  emitter: indicator, signal: 'repaint',
                                                                                callback: this._paintWindowIndicator, scope: this });
                            this._badgesWindows.push(indicator);
                            this.appButton.badgeAdd('window-indicator-' + i,
                                                    indicator,
                                                    undefined,
                                                    0.0625 * (2 * i + 4), 1.0,
                                                    0, (-global.yawl._iconsClipBottom || 0) / 2);
                        }
                    }
                    switch (this.windows.length) {
                        case 2:
                            this.appButton.badgeShow('window-indicator-1');
                            this.appButton.badgeShow('window-indicator-3');
                            break;
                        default:
                            this.appButton.badgeShow('window-indicator-0');
                            this.appButton.badgeShow('window-indicator-4');
                        case 1:
                            this.appButton.badgeShow('window-indicator-2');
                    }
                } // if (indicatorType == 2) else if (indicatorType == 1)
            } // if (!this.windows.length) else
		} // if ("app icon should be hidden") else let (indicatorType, stopped)
        _D('<');
	},

	updateBadges: function() {
        _D('>' + this.__name__ + '.updateBadges()');
		if (!this.appButton || !global.yawl) {
			_D(!this.appButton ? 'this.appButton === null' : 'global.yawl === null');
			_D('<');
			return;
		}
        if (this._badgesWindowsNumber) {
            this.appButton.badgeShift('window-indicator-number', 3, -global.yawl._iconsClipBottom || 0);
        }
        if (this._badgesWindows && this._badgesWindows.length) {
            for (let i = 0; i < this._badgesWindows.length; ++i) {
                this.appButton.badgeShift('window-indicator-' + i, 0, (-global.yawl._iconsClipBottom || 0) / 2);
            }
        }
        _D('<');
	},

	_updateFocused: function() {
        _D('@' + this.__name__ + '._updateFocused()');
        if (!this._tracker || !this._tracker.getTracker) {
            _D(!this._tracker ? 'this._tracker === null' : 'this._tracker.getTracker === null');
            _D('<');
            return;
        }
		let (focused = (this.metaApp == this._tracker.getTracker().focus_app)) {
            this.focused = focused;
            if (this.appButton && this.appButton.actor) {
                if (this.focused) this.appButton.actor.add_style_pseudo_class('active');
                else this.appButton.actor.remove_style_pseudo_class('active');
            }
            //this._resetNextWindows(); // commented out: gets called when a window of the same application is changed
		} // let (focused)
        _D('<');
	},

	updateMenu: function() {
        _D('>' + this.__name__ + '.updateMenu()');
		this._cancelCreateMenuTimeout();
		this._createMenuTimeout = Mainloop.timeout_add(777, Lang.bind(this, this._createMenu));
        _D('<');
	},

    _cancelCreateMenuTimeout: function() {
        _D('>' + this.__name__ + '._cancelCreateMenuTimeout()');
        if (this._createMenuTimeout) {
            Mainloop.source_remove(this._createMenuTimeout);
            this._createMenuTimeout = null;
        }
        _D('<');
    },

	_createMenu: function() {
		_D('>' + this.__name__ + '._createMenu()');
		this._cancelCreateMenuTimeout();
        if (!this.appButton || !global.yawl || !global.yawl.menuBuilder) {
            _D('<');
            return;
        }
        let (menu = this.appButton.menu,
             open = this.appButton.menu && this.appButton.menu.isOpen) {
            this._signals.disconnectId('menu-toggled');
            if (menu) {
                menu.close();
                menu = null;
                this.appButton.setMenu(null); // destroy old menu and set this.appButton.menu = null
            }
            menu = global.yawl.menuBuilder.build(this, this.appButton.actor);
			if (menu) {
				this.appButton.setMenu(menu);
                if (this.appButton.menu) {
                    if (this._menuManager) this._menuManager.addMenu(this.appButton.menu);
                    this._signals.connectId('menu-toggled', {	emitter: this.appButton.menu, signal: 'open-state-changed',
                                                                callback: this._menuToggled, scope: this });
                }
                if (open) menu.open();
			}
        }
        _D('<');
	},

    _menuToggled: function(menu, state) {
        _D('>' + this.__name__ + '._menuToggled()');
		if (!state) {
			// make sure we are still "active" if focused
			this._updateFocused();
		}
		else {
			this.hideWindowsGroup();
		}
        _D('<');
    },

    menuToggle: function() {
        _D('>' + this.__name__ + '.menuToggle()');
        if (this.appButton && this.appButton.menu) {
			this.appButton.menu.toggle();
		}
        _D('<');
    },

	_enterEvent: function() {
		_D('>' + this.__name__ + '._enterEvent()');
		this.hovered = true;
		this.setLabel('');
		if (global.yawl && global.yawl._windowsShow) this.showWindowsGroup();
		_D('<');
	},

	_leaveEvent: function() {
		_D('>' + this.__name__ + '._leaveEvent()');
		this.hovered = false;
		this.hideWindowsGroup();
		_D('<');
	},

    setLabel: function(text) {
        _D('>' + this.__name__ + '.setLabel()');
        if (this.yawlPanelWindowsGroup) this.yawlPanelWindowsGroup.labelText = text;
        _D('<');
    },

    addWindow: function(metaWindow) {
        _D('>' + this.__name__ + '.addWindow()');
        if (metaWindow && this.windows && this.windows.indexOf(metaWindow) == -1) {
			this.windows.push(metaWindow);
            if (this._tracker && this._tracker.getTrackerWindow) {
                let (trackerWindow = this._tracker.getTrackerWindow(metaWindow)) {
                    if (trackerWindow && trackerWindow.windowThumbnail && this.yawlPanelWindowsGroup) {
                        this.yawlPanelWindowsGroup.addChild(trackerWindow.windowThumbnail);
                    }
                }
            }
			this._resetNextWindows();
            this.updateVisibility();
		}
        _D('<');
    },

    removeWindow: function(metaWindow) {
        _D('>' + this.__name__ + '.removeWindow()');
        if (metaWindow && this.windows) {
            let (i = this.windows.indexOf(metaWindow)) {
                if (i != -1) {
					this.windows.splice(i, 1);
					this._resetNextWindows();
					this.updateVisibility();
				}
            }
        }
        _D('<');
    },

    attention: function(state) {
        _D('>' + this.__name__ + '.attention()');
        this._cancelAttentionTimeout();
        this._attention = !!state;
        if (this.appButton) {
            if (this.appButton.actor) {
                if (this._attention) this.appButton.actor.add_style_pseudo_class('attention');
                else this.appButton.actor.remove_style_pseudo_class('attention');
            }
            if (this.appButton.container) {
                if (this._attention) this.appButton.container.add_style_pseudo_class('attention');
                else this.appButton.container.remove_style_pseudo_class('attention');
            }
        }
        if (!this._attention || !global.yawl
                || !global.yawl._iconsAttentionBlink
                || !global.yawl._iconsAttentionBlinkRate) {
            if (this.appButton && this.appButton.actor) {
                this.appButton.actor.opacity = 255;
            }
        }
        else {
			this._attentionAnimationDirection = 1;
            this._attentionAnimationLevels = Math.round(545.45454545454545 / global.yawl._iconsAttentionBlinkRate);
            this._attentionAnimationConstant = this._attentionAnimationLevels / 240;
            this._attentionTimeout = Mainloop.timeout_add(55, Lang.bind(this, this._attentionAnimation));
        }
        _D('<');
    },

    _cancelAttentionTimeout: function() {
        _D('>' + this.__name__ + '._cancelAttentionTimeout()');
        if (this._attentionTimeout) {
            Mainloop.source_remove(this._attentionTimeout);
            this._attentionTimeout = null;
        }
        _D('<');
    },

	_attentionAnimation: function() {
		if (this.appButton && this.appButton.actor) {
            let (level = Math.round((this.appButton.actor.opacity - 15)
                    * this._attentionAnimationConstant)) {
                if (level <= 0) this._attentionAnimationDirection = 1;
                else if (level >= this._attentionAnimationLevels) this._attentionAnimationDirection = -1;
                else if (this._attentionAnimationDirection !== -1) this._attentionAnimationDirection = 1;
                this.appButton.actor.opacity = Math.round((level + this._attentionAnimationDirection)
                                                          / this._attentionAnimationConstant + 15);
            }
            return true;
		}
		return false;
	},

	_appButtonAllocationChanged: function() {
        _D('>' + this.__name__ + '._appButtonAllocationChanged()');
		if (this.yawlPanelWindowsGroup && !this.yawlPanelWindowsGroup.hidden && !this.yawlPanelWindowsGroup.hiding) {
			this.positionWindowsGroup();
		}
        _D('<');
	},

	getStableSequence: function() {
        _D('>' + this.__name__ + '.getStableSequence()');
		let (sequence = undefined) {
			if (global.yawl && global.yawl._iconsOrder) {
                try { sequence = JSON.parse(global.yawl._iconsOrder); } catch (e) { }
			}
            if (!sequence
                || Object.prototype.toString.call(sequence) != '[object Array]'
                || !sequence.length) sequence = [];
            _D('<');
            return sequence;
		}
	},

	setStableSequence: function(sequence) {
        _D('>' + this.__name__ + '.setStableSequence()');
        if (global.yawl && sequence && Object.prototype.toString.call(sequence) == '[object Array]') {
            let (json = undefined) {
                try { json = JSON.stringify(sequence); } catch (e) { }
                if (json) global.yawl.set('icons-order', json);
            }
        }
        _D('<');
	},

    getPosition: function() {
        _D('>' + this.__name__ + '.getPosition()');
        if (this.appButton && global.yawl.panelApps) {
            _D('<');
            return global.yawl.panelApps.getChildPosition(this.appButton);
        }
        _D('<');
        return undefined;
    },

    moveToPosition: function(position, updateStableSequence/* = true*/) {
        _D('>' + this.__name__ + '.moveToPosition()');
        if (!position && position !== 0
            || !this.metaApp
            || !this.appButton
            || !this.yawlPanelWindowsGroup
            || !global.yawl
            || !global.yawl.panelApps
            || !global.yawl.panelApps._childrenObjects
            || !global.yawl.panelApps._childrenObjects._keys
            || !global.yawl.panelWindows) {
            _D('<');
            return;
        }
        if (updateStableSequence === undefined) updateStableSequence = true;
        else updateStableSequence = !!updateStableSequence;
        updateStableSequence =  updateStableSequence
                                && global.yawl._mouseDragAndDrop
                                && global.yawl._iconsDragAndDrop;
        let (position_ = this.getPosition()) {
            if (position_ !== undefined && position !== position_) {
                position = global.yawl.panelApps.moveChild(this.appButton, position);
                if (position !== undefined && position !== position_) {
                    global.yawl.panelWindows.moveChild(this.yawlPanelWindowsGroup, position);
                    if (updateStableSequence) {
                        let (sequence = this.getStableSequence(),
                             id = this.metaApp.get_id()) {
                            let (index = sequence && id ? sequence.indexOf(id) : -1,
                                 nextIndex = -1,
                                 keys = global.yawl.panelApps._childrenObjects._keys) {
                                if (index != -1) {
                                    (position < position_
                                     ? keys.slice(position + 1)
                                     : keys.slice(0, position).reverse())
                                    .some(function (appButton) {
                                        let (metaApp =  appButton && !appButton.hidden
                                                        && !appButton.hiding && appButton.metaApp) {
                                            let (id = metaApp && metaApp.get_id()) {
                                                let (index = id ? sequence.indexOf(id) : -1) {
                                                    return  index != -1
                                                            ? (nextIndex = index, true)
                                                            : false;
                                                }
                                            }
                                        }
                                    });
                                    if (nextIndex != -1) {
                                        sequence.splice(index, 1);
                                        sequence.splice(nextIndex, 0, id);
                                        this.setStableSequence(sequence);
                                    }
                                } // if (index != -1)
                            } // let (index, nextIndex, keys)
                        } // let (sequence, id)
                    } // if (updateStableSequence)
                } // if (position !== undefined && position !== position_)
            } // if (position_ !== undefined && position !== position_)
        } // let (position_)
        _D('<');
    },

    _moveToStablePosition: function() {
        _D('>' + this.__name__ + '._moveToStablePosition()');
        if (!this.metaApp
            || this.metaApp.is_window_backed()
            || !global.yawl
            || !global.yawl._mouseDragAndDrop
            || !global.yawl._iconsDragAndDrop
            || !global.yawl.panelApps
            || !global.yawl.panelApps._childrenObjects
            || !global.yawl.panelApps._childrenObjects._keys) {
            _D('<');
            return;
        }
        let (position = 0,
             sequence = this.getStableSequence(),
             id = this.metaApp.get_id()) {
            if (sequence && id) {
                let (index = sequence.indexOf(id)) {
                    if (index !== -1) {
                        global.yawl.panelApps._childrenObjects._keys
                        .every(function (appButton, position_) {
                            let (metaApp = appButton && appButton.metaApp) {
                                let (id = metaApp && metaApp.get_id()) {
                                    let (index_ = id ? sequence.indexOf(id) : -1) {
                                        if (index_ < index) {
                                            if (index_ != -1) position = position_ + 1;
                                            return true;
                                        }
                                        return false;
                                    }
                                }
                            }
                        });
                        this.moveToPosition(position, false);
                    }
                    else {
                        sequence.push(id);
                        this.setStableSequence(sequence);
                    }
                } // let(index)
            } // if (sequence && id)
        } // let (position, sequence, id)
        _D('<');
    },

	positionWindowsGroup: function() {
        _D('>' + this.__name__ + '.positionWindowsGroup()');
		if (global.yawl.panelWindows) {
            let (x = 0,
                 y = 0,
                 w = 0) {
                if (Main.layoutManager && Main.layoutManager.panelBox
                        && Main.layoutManager.panelBox.get_stage()) {
                    x = Main.layoutManager.panelBox.get_x();
                    y = Main.layoutManager.panelBox.get_y() + Main.layoutManager.panelBox.get_height();
                    w = Main.layoutManager.panelBox.get_width();
                }
                global.yawl.panelWindows.x = x;
                global.yawl.panelWindows.y = y;
                global.yawl.panelWindows.width = w;
                let (container = this.appButton && this.appButton.container) {
                    if (container && container.get_stage()) {
                        global.yawl.panelWindows.animateToState({
                            gravity: w && Math.round(container.get_transformed_position()[0]
                                     + container.get_width() / 2 - x) / w || 0
                        }, null, null, global.yawl.panelWindows.hidden ? 0 : null);
                    } // if (container && container.get_stage())
                } // let (container)
            } // let (x, y, w)
		} // if (global.yawl.panelWindows)
        _D('<');
	},

    showWindowsGroup: function(time) {
        _D('>' + this.__name__ + '.showWindowsGroup()');
		this._cancelShowThumbnailsTimeout();
        if (this.appButton && this.appButton.menu && this.appButton.menu.isOpen
            || !this.windows || !this.windows.length) {
            _D('<');
            return;
        }
		if (this.yawlPanelWindowsGroup && global.yawl && global.yawl.panelWindows) {
			this._showThumbnailsTimeout = Mainloop.timeout_add(
                    time === 0 ? 0 : Math.max(33, global.yawl.panelWindows.hidden && global.yawl._windowsShowDelay || 0),
                    Lang.bind(this, function() {
                        this._cancelShowThumbnailsTimeout();
                        if (this.appButton && this.appButton.menu && this.appButton.menu.isOpen) return;
                        if (this.appButton && this.appButton.menuWindows && this.appButton.menuWindows.isOpen) return;
                        this.positionWindowsGroup(); // position it before showing if it is hidden
						if (this._tracker && this._tracker.preview && this._tracker.preview.container
								&& Main.layoutManager && Main.layoutManager.panelBox) {
							Main.uiGroup.set_child_above_sibling(this._tracker.preview.container, Main.layoutManager.panelBox);
						}
						if (global.yawl && global.yawl.panelWindows) {
                            if (global.yawl.panelWindows.container) {
    							Main.uiGroup.set_child_above_sibling(global.yawl.panelWindows.container, null);
                            }
                            if (global.yawl.panelWindows.hidden
                                    || global.yawl.panelWindows._lastWindowsGroupTrackerApp !== this) {
                                if (this._tracker && this._tracker.preview) {
                                    this._tracker.preview.panelTransparent = false;
                                }
                            }
						}
                        global.yawl.panelWindows.show(time, null, null, null, this.yawlPanelWindowsGroup);
                        global.yawl.panelWindows._lastWindowsGroupTrackerApp = this;
                    })
            );
        } // if (this.yawlPanelWindowsGroup && global.yawl.panelWindows)
        _D('<');
    },

    hideWindowsGroup: function(time) {
        _D('>' + this.__name__ + '.hideWindowsGroup()');
		this._cancelShowThumbnailsTimeout();
		if (this.yawlPanelWindowsGroup && global.yawl.panelWindows) {
			this._showThumbnailsTimeout = Mainloop.timeout_add(
			        time === 0 ? 0 : 77,
			        Lang.bind(this, function() {
						this._cancelShowThumbnailsTimeout();
						global.yawl.panelWindows.hide(time, null, null, null, true, this.yawlPanelWindowsGroup);
					})
			);
		} // if (this.yawlPanelWindowsGroup && global.yawl.panelWindows)
        _D('<');
    },

	_listWindowsFresh: function(minimized/* = false*/, allworkspacesifempty/* = false*/) {
        _D('>' + this.__name__ + '._listWindowsFresh()');
		if (!this.metaApp || this.metaApp.state == Shell.AppState.STOPPED) {
			_D('<');
			return [];
		}
		let (windows = []) {
			let (workspace = global.screen.get_active_workspace()) {
				windows = this.metaApp.get_windows().filter(function (window) {
					return window.get_workspace() == workspace && (minimized || window.showing_on_its_workspace());
                });
			} // let (workspace)
			if (!windows.length && allworkspacesifempty) {
				if (minimized) {
					windows = this.metaApp.get_windows();
				}
				else {
					windows = this.metaApp.get_windows().filter(function (window) {
						return window.showing_on_its_workspace();
					});
				}
				windows = windows.map(function (metaWindow) { return [ metaWindow.get_workspace().index(), metaWindow ]; });
				windows.sort(function (imwA, imwB) { return imwA[0] - imwB[0]; });
			}
	        _D('<');
			return windows;
		} // let (windows)
	},

    _resetNextWindows: function() {
        _D('>' + this.__name__ + '._resetNextWindows()');
        this._cancelNextWindowsTimeout();
		this._nextWindowsWorkspace = null;
        this._nextWindowsLength = 0;
        this._nextWindowsIndex = 0;
        _D('<');
    },

    _cancelNextWindowsTimeout: function() {
        _D('>' + this.__name__ + '._cancelNextWindowsTimeout()');
        if (this._nextWindowsTimeout) {
            Mainloop.source_remove(this._nextWindowsTimeout);
            this._nextWindowsTimeout = null;
        }
        _D('<');
    },

    _cancelShowThumbnailsTimeout: function() {
        _D('>' + this.__name__ + '._cancelShowThumbnailsTimeout()');
        if (this._showThumbnailsTimeout) {
            Mainloop.source_remove(this._showThumbnailsTimeout);
            this._showThumbnailsTimeout = null;
        }
        _D('<');
    },

    _nextWindow: function(minimized/* = false*/, showall/* = false*/, minimize/* = false*/) {
        _D('>' + this.__name__ + '._nextWindow()');
        if (this.appButton && this.appButton.menuWindows && this.appButton.menuWindows.isOpen) {
            this.appButton.menuWindows.close();
            _D('<');
            return;
        }
		let (windows = this._listWindowsFresh(minimized, true)) {
			if (windows.length && !windows[0].length) { // windows are from the current workspace
				if (!this.focused) {
                    if (showall) this._showAllWindows(minimized);
                    else if (this._tracker) this._tracker.activateWindow(windows[0]);
                    this._resetNextWindows();
				} // if (!this.focused)
                else if (windows.length == 1 && minimize) {
                    if (this._tracker) this._tracker.minimizeWindow(windows[0]);
                    this._resetNextWindows();
                } // if (!this.focused) else if (windows.length == 1 && minimize)
				else {
					if (!this._nextWindowsIndex || !this._nextWindowsLength
					    	|| this._nextWindowsLength != windows.length
					    	|| this._nextWindowsWorkspace != global.screen.get_active_workspace()) {
						this._nextWindowsWorkspace = global.screen.get_active_workspace();
						this._nextWindowsLength = windows.length;
						this._nextWindowsIndex = 0;
					}
					if (this._tracker) this._tracker.activateWindow(windows[Math.min(++this._nextWindowsIndex, this._nextWindowsLength - 1)]);
                    if (showall) this._showAllWindows(minimized);
					this._cancelNextWindowsTimeout();
					this._nextWindowsTimeout = Mainloop.timeout_add(3333, Lang.bind(this, this._resetNextWindows));
				} // if (!this.focused) else if (windows.length == 1 && minimize) else
			}
			else if (windows.length) { // windows are all not from the current workspace
				// if all windows are from the same workspace, activate all or the first one
				if (windows[0][0] == windows[windows.length - 1][0]) {
					if (this._tracker) this._tracker.activateWindow(windows[0][1]);
                    if (showall) this._showAllWindows(minimized);
                    this._resetNextWindows();
				}
				else { // else bring up a menu listing all windows on different workspaces
					if (this.appButton && this.appButton.menuWindows) {
						this.appButton.menuWindows.toggle();
					}
				}
			}
            else { // no windows at all? open a new window
                this.openNewWindowThisWorkspace();
            }
		} // let (windows)
        _D('<');
    },

    nextWindowNonMinimized: function() {
        _D('>' + this.__name__ + '.nextWindowNonMinimized()');
        this._nextWindow();
        _D('<');
    },

    nextWindow: function() {
        _D('>' + this.__name__ + '.nextWindow()');
        this._nextWindow(true);
        _D('<');
    },

    nextWindowMinimize: function() {
        _D('>' + this.__name__ + '.nextWindowMinimize()');
        this._nextWindow(true, false, true);
        _D('<');
    },

	_showAllWindows: function(minimized/* = false*/) {
        _D('>' + this.__name__ + '._showAllWindows()');
		let (windows = this._listWindowsFresh(minimized)) {
            if (windows.length) { // not necessary, but for consistency
    			for (let i = windows.length - 1; i >= 0; --i) {
                    if (this._tracker) this._tracker.activateWindow(windows[i]);
                }
            } // if (windows.length)
		} // let (windows)
        _D('<');
	},

    showAllWindowsNonMinimized: function() {
        _D('>' + this.__name__ + '.showAllWindowsNonMinimized()');
		this._showAllWindows();
        _D('<');
    },

    showAllWindows: function() {
        _D('>' + this.__name__ + '.showAllWindows()');
		this._showAllWindows(true);
        _D('<');
    },

    _showAllNext: function(minimized/* = false*/) {
        _D('>' + this.__name__ + '._showAllNext()');
		this._nextWindow(minimized, true);
        _D('<');
    },

    showAllNextNonMinimized: function() {
        _D('>' + this.__name__ + '.showAllNextNonMinimized()');
		this._showAllNext();
        _D('<');
    },

    showAllNext: function() {
        _D('>' + this.__name__ + '.showAllNext()');
		this._showAllNext(true);
        _D('<');
    },

	_rotateWindows: function(backward/* = false*/) {
        _D('>' + this.__name__ + '._rotateWindows()');
		let (windows = this._listWindowsFresh()) {
            if (windows.length) {
				if (!this.focused) {
					if (this._tracker) this._tracker.activateWindow(windows[0]);
				} // if (!this.focused)
				else {
                    if (backward) {
                        if (windows.length > 1) {
                            if (this._tracker) this._tracker.activateWindow(windows[windows.length - 1]);
                        }
                    }
                    else {
                        for (let i = windows.length - 1; i > 0; --i) {
                            if (this._tracker) this._tracker.activateWindow(windows[i]);
                        }
                    }
				} // if (!this.focused) else
            } // if (windows.length)
		} // let (windows)
        _D('<');
	},

    rotateWindowsForward: function() {
        _D('>' + this.__name__ + '.rotateWindowsForward()');
		this._rotateWindows();
        _D('<');
    },

    rotateWindowsBackward: function() {
        _D('>' + this.__name__ + '.rotateWindowsBackward()');
		this._rotateWindows(true);
        _D('<');
    },

	_minimizeWindows: function(topOnly/* = false*/) {
        _D('>' + this.__name__ + '._minimizeWindows()');
		let (windows = this._listWindowsFresh()) {
			if (windows.length && this._tracker) {
				if (topOnly) this._tracker.minimizeWindow(windows[0]);
				else windows.forEach(Lang.bind(this, function (window) { this._tracker.minimizeWindow(window); }));
			} // if (windows.length)
		} // let (windows)
        _D('<');
	},

    minimizeTopWindow: function() {
        _D('>' + this.__name__ + '.minimizeTopWindow()');
		this._minimizeWindows(true);
        _D('<');
    },

    minimizeAllWindows: function() {
        _D('>' + this.__name__ + '.minimizeAllWindows()');
		this._minimizeWindows();
        _D('<');
    },

    _maximizeToggle: function(window) {
        _D('>' + this.__name__ + '._maximizeToggle()');
        if (window) {
            if ((window.get_maximized() & (Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL))
                                        == (Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL)) {
                window.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
            }
            else {
                window.maximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
            }
        } // if (window)
        _D('<');
    },

	_maximizeWindows: function(topOnly/* = false*/) {
        _D('>' + this.__name__ + '._maximizeWindows()');
		let (windows = this._listWindowsFresh()) {
			if (windows.length) {
				if (topOnly) this._maximizeToggle(windows[0]);
				else windows.forEach(Lang.bind(this, function(window) { this._maximizeToggle(window); }));
			} // if (windows.length)
		} // let (windows)
        _D('<');
	},

    maximizeTopWindow: function() {
        _D('>' + this.__name__ + '.maximizeTopWindow()');
		this._maximizeWindows(true);
        _D('<');
    },

    maximizeAllWindows: function() {
        _D('>' + this.__name__ + '.maximizeAllWindows()');
		this._maximizeWindows();
        _D('<');
    },

	_openNewWindow: function(workspaceIndex/* = -1*/) {
        _D('>' + this.__name__ + '._openNewWindow()');
		if (!this.metaApp) {
			_D('this.metaApp === null');
			_D('<');
			return;
		}
		if (workspaceIndex !== undefined) {
			if (workspaceIndex < 0 || workspaceIndex >= global.screen.n_workspaces) {
				_D('workspaceIndex === ' + workspaceIndex + ', n_workspaces === ' + global.screen.n_workspaces);
				_D('<');
				return;
			}
			let (workspace = global.screen.get_workspace_by_index(workspaceIndex)) {
				if (workspace) workspace.activate(Math.round(GLib.get_monotonic_time() / 1000));
			}
		} // if (workspaceIndex !== undefined)
		if (this.metaApp.state != Shell.AppState.STOPPED) this.metaApp.open_new_window(-1);
		else this.metaApp.activate();
        _D('<');
	},

    openNewWindowThisWorkspace: function() {
        _D('>' + this.__name__ + '.openNewWindowThisWorkspace()');
		this._openNewWindow();
        _D('<');
    },

    openNewWindowNewWorkspace: function() {
        _D('>' + this.__name__ + '.openNewWindowNewWorkspace()');
		this._openNewWindow(global.screen.n_workspaces ? global.screen.n_workspaces - 1 : 0); // just in case
        _D('<');
    },

    openMenu: function() {
        _D('>' + this.__name__ + '.openMenu()');
        this.menuToggle();
        _D('<');
    },

    quitApplication: function() {
        _D('>' + this.__name__ + '.quitApplication()');
        if (this.metaApp) this.metaApp.request_quit();
        _D('<');
    }
});
Signals.addSignalMethods(dbFinTrackerApp.prototype);
