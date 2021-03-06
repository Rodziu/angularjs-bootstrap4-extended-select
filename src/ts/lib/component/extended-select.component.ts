/*
 * AngularJS extended select component.
 * Copyright (c) 2016-2021 Rodziu <mateusz.rohde@gmail.com>
 * License: MIT
 */

import {
    IAttributes,
    IComponentOptions,
    INgModelController,
    IPromise,
    IScope,
    ITimeoutService,
    ITranscludeFunction
} from 'angular';
import {ExtendedSelectOptionsService, IParsedNgOptions} from '../service/extended-select-options.service';
import {IExtendedSelectOptions} from '../extended-select.provider';
import * as angular from 'angular';

export interface IGroupItem {
    name: string,
    parentGroup: string,
    children: IGroupItem[],
    level?: number,
    parent?: IGroupItem
}

export interface IExtendedSelectOption {
    value: unknown,
    label: string,
    group?: IGroupItem
}

/**
 * @ngInject
 */
export class ExtendedSelectComponentController {
    // bindings
    ngModel: unknown | unknown[];
    addOption: (locals: { value: string }) => void;
    resolveOnSearch: (locals: { value: string, page: number }) => IPromise<{ hasNextPage?: boolean }>;
    deselectable: boolean;
    deselectValue: unknown;
    typeToSearch: number;
    searchByValue: boolean;
    ngModelCtrl: INgModelController;
    //
    options: IExtendedSelectOption[] = [];
    optionsFiltered: IExtendedSelectOption[] = [];
    activeIndex = -1;
    search = '';
    multiple: boolean;
    addOptionLang: string;
    loadMoreResultsLang: string;
    typeToSearchText: string;
    placeholder: string;
    isDisabled: boolean;
    isReadonly: boolean;
    isSmall: boolean;
    isLarge: boolean;
    isOpen: boolean;
    hasNextPage: boolean;
    page: number;
    loading: boolean;
    private _ngOptions: IParsedNgOptions;
    private _searchTimeout = null;
    private _optionObjects: Record<string, unknown>[];
    private _addOptionCalled: boolean;
    private _lastSearchValue: string;
    private _transcludedOptions: IExtendedSelectOption[] = [];

    constructor(
        private $element: JQLite,
        private $attrs: IAttributes,
        private $scope: IScope,
        private $timeout: ITimeoutService,
        private $transclude: ITranscludeFunction,
        private extendedSelectOptions: ExtendedSelectOptionsService,
        private extendedSelect: IExtendedSelectOptions
    ) {
        this._ngOptions = 'ngOptions' in $attrs
            ? extendedSelectOptions.parseNgOptions($attrs['ngOptions']) : null;
        this.multiple = 'multiple' in this.$attrs;
        this.placeholder = 'multiple' in this.$attrs
            ? this.extendedSelect.placeholderMultiple : this.extendedSelect.placeholder;
    }

    $onInit(): void {
        if (!this.deselectable && 'deselectable' in this.$attrs && !this.$attrs.deselectable.length) {
            this.deselectable = true;
        }

        this.addOptionLang = this.extendedSelect.addOptionLang;
        this.loadMoreResultsLang = this.extendedSelect.loadMoreResultsLang;
        this.typeToSearchText = this.extendedSelect.typeToSearchText;

        if (angular.isUndefined(this.typeToSearch)) {
            this.typeToSearch = this.extendedSelect.typeToSearch;
        }
        if (angular.isUndefined(this.searchByValue)) {
            this.searchByValue = this.extendedSelect.searchByValue;
        }
        if (this.multiple) {
            this.ngModelCtrl.$isEmpty = function(value) {
                return !value || value.length === 0;
            };
        }
        this._transcludedOptions = [];
        this.$transclude((clone) => {
            angular.forEach(clone, (optionElement: HTMLOptionElement) => {
                this._transcludedOptions.push({
                    value: optionElement.value,
                    label: optionElement.textContent
                });
            });
        }, null, 'option');
        //
        this.$attrs.$observe('placeholder', (value) => {
            this.placeholder = value as string;
        });
        this.$attrs.$observe('disabled', (value) => {
            this.isDisabled = value === true || angular.isString(value);
        });
        this.$attrs.$observe('readonly', (value) => {
            this.isReadonly = value === true || angular.isString(value);
        });
    }

    $doCheck(): void {
        this.isSmall = this.$element.hasClass('custom-select-sm');
        this.isLarge = this.$element.hasClass('custom-select-lg');
        if (this._ngOptions !== null) {
            const optionObjects = this._ngOptions.valuesFn(this.$scope.$parent);
            if (angular.isDefined(optionObjects) && !angular.equals(optionObjects, this._optionObjects)) {
                this._optionObjects = angular.copy(optionObjects);
                this.updateOptions(optionObjects);
            }
        }
    }

    updateOptions(optionObjects: Record<string, unknown>[]): void {
        const options = angular.copy(this._transcludedOptions),
            groups = [],
            groupsTree = [],
            addGroup = (groupName: string, parentGroup?: string) => {
                if (angular.isDefined(parentGroup)) {
                    addGroup(parentGroup);
                }
                let groupItem = groups.find((item) => {
                    return item.name === groupName;
                });

                if (angular.isUndefined(groupItem)) {
                    groupItem = {
                        name: groupName,
                        parentGroup,
                        children: []
                    };
                    groups.push(groupItem);
                } else if (angular.isDefined(parentGroup) && groupItem.parentGroup !== parentGroup) {
                    groupItem.parentGroup = parentGroup;
                }

                return groupItem;
            };
        let pickLater;

        optionObjects.forEach((optionObject, key) => {
            const locals = this._ngOptions.getLocals(key, optionObject),
                groupName = this._ngOptions.groupByFn(this.$scope.$parent, locals),
                parentGroup = this._ngOptions.nestedByFn(this.$scope.$parent, locals);

            options.push({
                value: this._ngOptions.valueFn(this.$scope.$parent, locals),
                label: this._ngOptions.displayFn(this.$scope.$parent, locals),
                group: angular.isDefined(groupName) ? addGroup(groupName, parentGroup) : undefined
            });

            if (this._addOptionCalled && options[options.length - 1].label === this.search) {
                pickLater = options[options.length - 1];
                this._addOptionCalled = false;
            }
        });

        if (groups.length) {
            groups.forEach((item) => {
                let parent, parentChildren;
                if (angular.isUndefined(item.parentGroup)) {
                    parentChildren = groupsTree;
                } else {
                    parent = groups.find((subItem) => {
                        return subItem.name === item.parentGroup;
                    });
                    parentChildren = parent.children;
                }
                item.parent = parent;
                parentChildren.push(item);
            });
            const order = [],
                walkTree = (branch: IGroupItem[], level = 0) => {
                    branch.forEach((item) => {
                        order.push(item.name);
                        item.level = level;
                        walkTree(item.children, level + 1);
                    });
                }
            walkTree(groupsTree);
            options.sort((a, b) => {
                return order.indexOf(a.group.name) - order.indexOf(b.group.name);
            });
        }

        this.options = options;
        if (pickLater) {
            // in multiple mode, we need to wait until new option is added to this.options
            // before selecting it
            this.pickOption(pickLater);
        }
        this.filterData();
    }

    open(): void {
        const wasOpen = this.isOpen;
        this.ngModelCtrl.$setTouched();
        if (this.isDisabled || this.isReadonly) {
            this.isOpen = false;
        } else {
            this.isOpen = this.multiple ? true : !this.isOpen;
        }
        if (!wasOpen && this.isOpen) {
            this.search = '';
            // reset active index
            this.activeIndex = -1;
            this.options.some((option, i) => {
                if (this.isSelected(option)) {
                    this.activeIndex = i;
                    if (!this.multiple) {
                        return true; // break;
                    }
                }
            });
            this.filterData();
        }
    }

    _updateMultipleModel(newValue: unknown, removeValue?: unknown): void {
        // sort selected options, so we get same result as in select element.
        const sorted = [];
        this.options.forEach((option) => {
            if (
                (
                    this.isSelected(option)
                    || angular.equals(option.value, newValue)
                )
                && !angular.equals(option.value, removeValue)
                && !sorted.includes(option.value)
            ) {
                sorted.push(option.value);
            }
        });
        if (!angular.equals(this.ngModel, sorted)) {
            this.ngModel = sorted;
        }
    }

    filterData(): void {
        if (angular.isUndefined(this.search)) {
            angular.copy(this.options, this.optionsFiltered);
            return;
        }
        angular.copy([], this.optionsFiltered);
        if (this.search.length < this.typeToSearch) {
            return;
        }
        const search = this.search.toLowerCase();
        this.options.forEach((option) => {
            if (
                option.label.toLowerCase().includes(search)
                || (
                    this.searchByValue
                    && (
                        (
                            angular.isString(option.value)
                            && option.value.toLowerCase().includes(search)
                        )
                        || (
                            angular.isObject(option.value)
                            && angular.toJson(option.value).toLowerCase().includes(search)
                        )
                    )
                )
            ) {
                this.optionsFiltered.push(option);
            }
        });
    }

    isSelected(option: IExtendedSelectOption): boolean {
        if (angular.isUndefined(this.ngModel)) {
            return false;
        }
        if (this.multiple) {
            return (this.ngModel as unknown[]).includes(option.value);
        }
        return angular.equals(option.value, this.ngModel);
    }

    getModelLabel(value?: unknown): string {
        if (angular.isUndefined(value)) {
            value = this.ngModel;
        }
        const option = this.options.find((option) => {
            return angular.equals(option.value, value);
        });
        return option ? option.label : '';
    }

    searchFn(page?: number): void {
        if (angular.isUndefined(page)) {
            this.activeIndex = this.options.length ? 0 : -1;
        }
        this.hasNextPage = false;
        this.filterData();
        if (angular.isFunction(this.resolveOnSearch)) {
            this.page = page || 1;
            if (angular.isDefined(this.search) && this.search.length) {
                const timeout = angular.isUndefined(this._lastSearchValue) ? 0 : 750;
                if (this._searchTimeout !== null) {
                    this.$timeout.cancel(this._searchTimeout);
                }
                this._lastSearchValue = this.search;
                this.loading = true;
                this._searchTimeout = this.$timeout(() => {
                    this._searchTimeout = null;
                    this.resolveOnSearch({value: this.search, page: this.page})
                        .then((response) => {
                            this._lastSearchValue = undefined;
                            this.loading = false;
                            this.hasNextPage = response && !!response.hasNextPage;
                            this.filterData();
                        }).catch(angular.noop);
                }, timeout);
            }
        }
    }

    pickOption(option: IExtendedSelectOption): void {
        if (this.multiple) {
            if (angular.isUndefined(this.ngModel)) {
                this.ngModel = [];
            }
            if (!(this.ngModel as unknown[]).includes(option.value)) {
                this._updateMultipleModel(option.value);
            }
            this.activeIndex = -1;
            this.search = '';
        } else {
            this.isOpen = false;
            this.ngModel = option.value;
            this.activeIndex = this.options.indexOf(option);
        }
        this.hasNextPage = false;
        this.ngModelCtrl.$setViewValue(this.ngModel);
    }

    deselect(value: unknown): void {
        if (this.multiple) {
            this._updateMultipleModel(undefined, value);
        } else {
            this.ngModel = this.deselectValue;
        }
        this.activeIndex = -1;
        this.ngModelCtrl.$setViewValue(this.ngModel);
    }

    addOptionAction(): void {
        if (angular.isFunction(this.addOption) && this.search.length) {
            const option = this.options.find((option) => {
                return option.label === this.search;
            });
            if (option) {
                this.pickOption(option);
            } else {
                this.addOption({value: this.search});
                this._addOptionCalled = true;
                // we set this flag, so we can update ngModel with proper option,
                // which will be generated on next digest cycle
            }
        }
    }
}

/**
 * @ngdoc component
 * @name beforeOption
 */

/**
 * @ngdoc component
 * @name optionTemplate
 */

/**
 * @ngdoc component
 * @name extendedSelect
 *
 * @param {expression} ngModel
 * @param {expression|function} addOption
 * @param {expression|function} resolveOnSearch
 * @param {expression} deselectable
 * @param {expression|number} typeToSearch
 * @param {expression|boolean} searchByValue
 * @param {String} placeholder
 * @parma {String} multiple
 */

export const extendedSelectComponent: IComponentOptions = {
    require: {
        ngModelCtrl: 'ngModel'
    },
    bindings: {
        ngModel: '=',
        addOption: '&?',
        resolveOnSearch: '&?',
        deselectable: '<?',
        deselectValue: '<?',
        typeToSearch: '<?',
        searchByValue: '<?'
    },
    transclude: {
        option: '?option',
        beforeOption: '?beforeOption',
        optionTemplate: '?optionTemplate'
    },
    templateUrl: 'src/templates/extended-select.html',
    controllerAs: 'ctrl',
    controller: ExtendedSelectComponentController
}
