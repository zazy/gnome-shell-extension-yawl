/* -*- mode: js2; js2-basic-offset: 4; c-basic-offset: 4; tab-width: 4; indent-tabs-mode: nil -*-  */
/*
 * YAWL Gnome-Shell Extensions
 *
 * Copyright (C) 2013 Vadim Cherepanov @ dbFin <vadim@dbfin.com>
 *
 * YAWL, a group of Gnome-Shell extensions, is provided as
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
 * dbfinmenubuilder.js
 * Building menus for apps.
 *
 */

const Lang = imports.lang;

const St = imports.gi.St;
const Shell = imports.gi.Shell;

const AppFavorites = imports.ui.appFavorites;
const Main = imports.ui.main;
const PopupMenu = imports.ui.popupMenu;
const RemoteMenu = PopupMenu.RemoteMenu ? PopupMenu : imports.ui.remoteMenu;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

const dbFinArrayHash = Me.imports.dbfinarrayhash;
const dbFinConsts = Me.imports.dbfinconsts;

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

const _D = Me.imports.dbfindebug._D;

const dbFinPopupMenuScrollableSection = new Lang.Class({
    Name: 'dbFin.PopupMenuScrollableSection',
    Extends: PopupMenu.PopupMenuSection,

    _init: function() {
        this.parent();
		this.actor = new St.ScrollView({ style_class: 'popup-menu-section-scroll' });
		if (this.actor) {
			this.actor.add_actor(this.box);
			this.actor._delegate = this;
			this.actor.clip_to_allocation = true;
		}
		else if (this.box) {
			this.actor = this.box;
	        this.actor._delegate = this;
		}
    },

    destroy: function() {
		if (this.actor && this.actor.has_style_class_name('popup-menu-section-scroll')) {
            this.actor.remove_actor(this.box);
			this.actor.destroy();
			this.actor = this.box;
	        this.actor._delegate = this;
		}
        this.parent();
    }
});

const dbFinMenuBuilder = new Lang.Class({
	Name: 'dbFin.MenuBuilder',

    _init: function() {
        _D('>' + this.__name__ + '._init()');
        this._names = new dbFinArrayHash.dbFinArrayHash();
		if (Main.panel && Main.panel.actor) {
			this.menuWindowsManager = new PopupMenu.PopupMenuManager(Main.panel);
		}
        _D('<');
    },

	destroy: function() {
        _D('>' + this.__name__ + '.destroy()');
        if (this.menuWindowsManager) {
            this.menuWindowsManager = null;
        }
        if (this._names) {
            this._names.destroy();
            this._names = null;
        }
        _D('<');
	},

    _menuSetProperties: function(menu, metaApp, trackerApp, createPinMenu/* = true*/) {
        _D('>' + this.__name__ + '._menuSetProperties()');
        if (menu) {
            menu._yawlMetaApp = metaApp;
            menu._yawlTrackerApp = trackerApp;
            menu._yawlTracker = trackerApp && trackerApp._tracker || null;
            menu._yawlCreatePinMenu = (createPinMenu === undefined || !!createPinMenu);
            if (menu._yawlAddonsPosition !== undefined) {
                menu._yawlUpdateAddons = Lang.bind(this, this._menuUpdateAddons);
            }
            if (!menu._yawlOpenWas) {
                menu._yawlOpenWas = menu.open;
                menu.open = this.open;
            }
        }
        _D('<');
    },

    _menuUpdateAddons: function(menu, metaApp) {
        _D('>' + this.__name__ + '._menuUpdateAddons()');
        // menu add-ons
        if (!menu || !metaApp || menu._yawlAddonsPosition === undefined) {
            _D('<');
            return;
        }
        let (position = menu._yawlAddonsPosition >= 0 ? menu._yawlAddonsPosition : undefined) {
            if (global.yawl._appQuicklists && !menu._yawlMenuQuicklists) {
                let (mf = this._getMenuFunction('quicklists', 'setQuicklist')) {
                    if (mf) {
                        menu._yawlMenuQuicklists = new dbFinPopupMenuScrollableSection();
                        if (menu._yawlMenuQuicklists) {
                            mf(metaApp, menu._yawlMenuQuicklists);
                            if (menu._yawlMenuQuicklists.isEmpty()) {
                                menu._yawlMenuQuicklists.destroy();
                                menu._yawlMenuQuicklists = null;
                            }
                            else {
                                menu.addMenuItem(menu._yawlMenuQuicklists, position);
                                menu._yawlMenuQuicklistsSeparator = new PopupMenu.PopupSeparatorMenuItem();
                                if (menu._yawlMenuQuicklistsSeparator) {
                                    menu.addMenuItem(menu._yawlMenuQuicklistsSeparator, position);
                                }
                            }
                        }
                    }
                }
            }
            else if (!global.yawl._appQuicklists && menu._yawlMenuQuicklists) {
                if (menu._yawlMenuQuicklistsSeparator) {
                    menu._yawlMenuQuicklistsSeparator.destroy();
                    menu._yawlMenuQuicklistsSeparator = null;
                }
                menu._yawlMenuQuicklists.destroy();
                menu._yawlMenuQuicklists = null;
            }
        }
        _D('<');
    },

    build: function(trackerApp, actor, empty/* = false*/) {
        _D('>' + this.__name__ + '.build()');
		if (!trackerApp || !actor) {
	        _D('<');
            return null;
		}
        let (metaApp = trackerApp.metaApp,
             state = trackerApp.metaApp && trackerApp.metaApp.state == Shell.AppState.RUNNING ? 2 : 1,
             menu = null) {
            if (!metaApp) {
                _D('<');
                return null;
            }
            if (empty) {
                menu = new PopupMenu.PopupMenu(actor, 0.0, St.Side.TOP, 0);
                this._menuSetProperties(menu, metaApp, trackerApp, false);
                _D('<');
                return menu;
            }
            // remote menu
			if (metaApp.action_group && metaApp.menu) {
				menu = new RemoteMenu.RemoteMenu(actor, metaApp.menu, metaApp.action_group);
				if (menu && menu.isEmpty()) {
					if (typeof menu.destroy === 'function') menu.destroy();
					menu = null;
				}
                if (menu) {
                    if (!(menu.firstMenuItem instanceof PopupMenu.PopupSeparatorMenuItem)) menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(), 0);
                    menu._yawlAddonsPosition = 0;
                    this._menuSetProperties(menu, metaApp, trackerApp);
                    _D('<');
                    return menu;
                }
			}
            // if no remote menu
            menu = new PopupMenu.PopupMenu(actor, 0.0, St.Side.TOP, 0);
            if (!menu) {
                _D('<');
                return null;
            }
            // set up menu
            for (let i = 0, p = 0; i < dbFinConsts.arrayAppMenuItems.length; ++i) {
                let (   text = _(dbFinConsts.arrayAppMenuItems[i][0]),
                        functionName = dbFinConsts.arrayAppMenuItems[i][1],
                        inState = dbFinConsts.arrayAppMenuItems[i][2]) {
                    if (!text || !(state & inState)) continue;
                    if (text === 'addons') {
                        menu._yawlAddonsPosition = p;
                    }
                    else if (functionName && trackerApp[functionName]) {
                        menu.addAction(text, Lang.bind(trackerApp, trackerApp[functionName]));
                        ++p;
                    }
                    else {
                        menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                        ++p;
                    }
                } // let (text, functionName, inState)
            } // for (let i)
            this._menuSetProperties(menu, metaApp, trackerApp);
            _D('<');
            return menu;
        } // let (metaApp, menu)
    },

	open: function(animate) {
		if (this) {
            _D('>' + this.__name__ + '.open()');
			if (this._menuWindows) {
				if (typeof this._menuWindows.destroy === 'function') this._menuWindows.destroy();
				this._menuWindows = null;
			}
			if (this._yawlMetaApp && this._yawlTracker) {
				// addons
				if (typeof this._yawlUpdateAddons == 'function') {
		            this._yawlUpdateAddons(this, this._yawlMetaApp);
				}
                this._yawlUpdateAddons = null;
				// add windows
				let (windows = [],
                     tracker = this._yawlTracker.getTracker()) {
                    if (tracker) this._yawlMetaApp.get_windows().forEach(Lang.bind(this, function (metaWindow) {
						if (!metaWindow || !this._yawlTracker.isWindowInteresting(metaWindow)) return;
						windows.push([
								(metaWindow.is_on_all_workspaces() ? -1 : metaWindow.get_workspace().index()),
								metaWindow
						]);
					})); // if (tracker) this._yawlMetaApp.get_windows().forEach(metaWindow)
					if (windows.length) {
						this._menuWindows = new PopupMenu.PopupMenuSection();
						windows.sort(function (imwA, imwB) { return imwA[0] - imwB[0]; });
						let (wIndexWas = windows[0][0],
                             focusedWindow = global.display && global.display.focus_window || null) {
							windows.forEach(Lang.bind(this, function ([ wIndex, metaWindow ]) {
								if (wIndex !== wIndexWas) {
									wIndexWas = wIndex;
									this._menuWindows.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
								}
								let (title = metaWindow.get_title()) {
									if (title.length > 33) title = title.substring(0, 30) + '...';
									let (menuItem = this._menuWindows.addAction(title, Lang.bind(this, function () {
														if (this._yawlTracker) this._yawlTracker.activateWindow(metaWindow);
                                                    }))) {
                                        if (focusedWindow && (metaWindow === focusedWindow
                                                              || metaWindow === focusedWindow.get_transient_for())) {
                                            menuItem.setShowDot(true);
                                        }
										if (tracker && this._yawlTracker.hasAppWindowAttention(tracker.get_window_app(metaWindow), metaWindow)) {
											menuItem.addActor(new St.Icon({ icon_name: 'dialog-warning', icon_size: 16, x_align: St.Align.END }));
										}
									}
								}
							})); // windows.forEach([ wIndex, metaWindow ])
						} // let (wIndexWas, focusedWindow)
					} // if (windows.length)
				} // let (windows, tracker)
                // add pin menu
                if (this._yawlCreatePinMenu && this._yawlTrackerApp && this._yawlTrackerApp._isStable()) {
                    if (!this._menuWindows) {
                        this._menuWindows = new PopupMenu.PopupMenuSection();
                    }
                    else if (!this._menuWindows.isEmpty()) {
                        this._menuWindows.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
                    }
                    if (this._yawlTrackerApp.pin) {
                        this._menuWindows.addAction(_("Remove from Favorites"), Lang.bind(this, function() {
                            if (this._yawlMetaApp) AppFavorites.getAppFavorites().removeFavorite(this._yawlMetaApp.get_id());
                        }));
                    }
                    else {
                        this._menuWindows.addAction(_("Add to Favorites"), Lang.bind(this, function() {
                            if (this._yawlMetaApp) AppFavorites.getAppFavorites().addFavorite(this._yawlMetaApp.get_id());
                        }));
                    }
                }
                if (this._menuWindows) {
                    this.addMenuItem(this._menuWindows, 0);
                }
			} // if (this._yawlMetaApp && this._yawlTracker)
			if (this._yawlOpenWas) Lang.bind(this, this._yawlOpenWas)(animate);
            _D('<');
		} // if (this)
	},

    _getExtension: function(n, f) {
        _D('>' + this.__name__ + '._getExtension()');
		if (!this._names) {
			_D('<');
			return null;
		}
		let (en = this._names.get(n)) {
			if (en && ExtensionUtils.extensions[en]) {
				_D('<');
				return ExtensionUtils.extensions[en];
			}
			let (re = new RegExp('^' + n + '@')) {
				for (en in ExtensionUtils.extensions) {
					if (ExtensionUtils.extensions.hasOwnProperty(en)
							&& re.test(en)
					    	&& ExtensionUtils.extensions[en]
							&& ExtensionUtils.extensions[en].stateObj
							&& typeof ExtensionUtils.extensions[en].stateObj[f] === 'function') {
						this._names.set(n, en);
						_D('<');
						return ExtensionUtils.extensions[en];
					}
				} // for (en)
			} // let (re)
		} // let (en)
        _D('<');
		return null;
    },

    _getMenuFunction: function(n, f) {
        _D('>' + this.__name__ + '.getMenuFunction()');
		let (e = this._getExtension(n, f)) {
			_D('<');
			return e && e.stateObj[f] || null;
		}
    }
});
