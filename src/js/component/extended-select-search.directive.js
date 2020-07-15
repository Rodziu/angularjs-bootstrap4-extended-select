/*
 * AngularJS extended select component.
 * Copyright (c) 2016-2019 Rodziu <mateusz.rohde@gmail.com>
 * License: MIT
 */
!(function() {
    'use strict';

    /**
	 * @ngdoc directive
	 * @name extendedSelectSearch
	 * @description search element
	 */
    function extendedSelectSearchDirective() {
        return {
            restrict: 'A',
            require: '^extendedSelect',
            link: function(scope, element, attrs, ctrl) {
                ctrl.searchElement = element;
                /**
				 * move selection or pick an option on keydown
				 */
                element.on('keydown', function(e) {
                    if (!ctrl.optionsFiltered.length) {
                        if (e.which === 13) {
                            ctrl.addOptionAction();
                            scope.$apply();
                        }
                        return;
                    }
                    const originalIndex = ctrl.activeIndex;
                    switch (e.which) {
                        case 40: // down
                            do {
                                ctrl.activeIndex++;
                                if (ctrl.activeIndex >= ctrl.optionsFiltered.length) {
                                    ctrl.activeIndex = originalIndex;
                                    break;
                                }
                            } while (ctrl.multiple && ctrl.isSelected(ctrl.optionsFiltered[ctrl.activeIndex]));
                            break;
                        case 38: // up
                            do {
                                ctrl.activeIndex--;
                                if (ctrl.activeIndex < 0) {
                                    ctrl.activeIndex = originalIndex;
                                    break;
                                }
                            } while (ctrl.multiple && ctrl.isSelected(ctrl.optionsFiltered[ctrl.activeIndex]));
                            break;
                        case 13: // enter
                            if (angular.isDefined(ctrl.optionsFiltered[ctrl.activeIndex])) {
                                ctrl.pickOption(ctrl.optionsFiltered[ctrl.activeIndex]);
                                scope.$apply();
                                return;
                            }
                            break;
                    }
                    scope.$digest();
                });
            }
        };
    }

    angular.module('extendedSelect').directive('extendedSelectSearch', extendedSelectSearchDirective);
}());
