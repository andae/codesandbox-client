import { fromPairs, toPairs, sortBy, mapValues } from 'lodash-es';
import slugify from 'common/lib/utils/slugify';
import { clone } from 'mobx-state-tree';
import { dispatch } from 'codesandbox-api';

import getTemplate from 'common/lib/templates';
import { getTemplate as computeTemplate } from 'codesandbox-import-utils/lib/create-sandbox/templates';

function sortObjectByKeys(object) {
  return fromPairs(sortBy(toPairs(object), 0));
}

export function getLatestVersion({ props, api }) {
  const { name } = props;

  return api
    .get(`/dependencies/${name}@latest`)
    .then(({ version }) => ({ version }))
    .catch(() => {});
}

export function getIdFromModulePath({ props, state, utils }) {
  if (!props.path) {
    return {};
  }

  const sandbox = state.get('editor.currentSandbox');

  try {
    const module = utils.resolveModule(
      props.path.replace(/^\//, ''),
      sandbox.modules,
      sandbox.directories
    );

    return { id: module.id };
  } catch (e) {
    return {};
  }
}

export function addNpmDependencyToPackage({ state, props }) {
  const { parsed, code: oldCode } = state.get(
    'editor.parsedConfigurations.package'
  );

  const type = props.isDev ? 'devDependencies' : 'dependencies';

  parsed[type] = parsed[type] || {};
  parsed[type][props.name] = props.version || 'latest';
  parsed[type] = sortObjectByKeys(parsed[type]);

  return {
    oldCode,
    code: JSON.stringify(parsed, null, 2),
    moduleShortid: state.get(`editor.currentPackageJSON.shortid`),
  };
}

export function removeNpmDependencyFromPackage({ state, props }) {
  const { parsed, code: oldCode } = state.get(
    'editor.parsedConfigurations.package'
  );

  delete parsed.dependencies[props.name];
  parsed.dependencies = sortObjectByKeys(parsed.dependencies);

  return {
    oldCode,
    code: JSON.stringify(parsed, null, 2),
    moduleShortid: state.get(`editor.currentPackageJSON.shortid`),
  };
}

export function updateSandboxPackage({ state }) {
  const { parsed } = state.get('editor.parsedConfigurations.package');
  const sandbox = state.get('editor.currentSandbox');

  parsed.keywords = sandbox.tags;
  parsed.name = slugify(sandbox.title || sandbox.id);
  parsed.description = sandbox.description;

  return {
    code: JSON.stringify(parsed, null, 2),
    moduleShortid: state.get(`editor.currentPackageJSON.shortid`),
  };
}

export function setModuleSaved({ props, state }) {
  const changedModuleShortids = state.get('editor.changedModuleShortids');
  const newChangedModuleShortids = changedModuleShortids.filter(
    x => x !== props.shortid
  );

  state.set('editor.changedModuleShortids', newChangedModuleShortids);
}

export function setModuleSavedCode({ props, state }) {
  const sandbox = state.get('editor.currentSandbox');

  const moduleIndex = sandbox.modules.findIndex(
    m => m.shortid === props.moduleShortid
  );

  if (moduleIndex > -1) {
    state.set(
      `editor.sandboxes.${sandbox.id}.modules.${moduleIndex}.savedCode`,
      props.savedCode
    );
  }
}

export function ensureValidPrivacy({ props, path }) {
  const privacy = Number(props.privacy);

  return Number.isNaN(privacy) ? path.invalid() : path.valid({ privacy });
}

export function setCurrentModuleByTab({ state, props }) {
  const tabs = state.get('editor.tabs');
  const currentModuleShortid = state.get(`editor.currentModuleShortid`);
  const closedCurrentTab = !tabs.find(
    t => t.moduleShortid === currentModuleShortid
  );

  if (closedCurrentTab) {
    const index =
      state.get('editor.tabs').length - 1 >= props.tabIndex
        ? props.tabIndex
        : props.tabIndex - 1;

    const currentTab = state.get(`editor.tabs.${index}`);

    if (currentTab.moduleShortid) {
      const moduleShortid = currentTab.moduleShortid;

      state.set('editor.currentModuleShortid', moduleShortid);
    }
  }
}

export function updatePrivacy({ api, props, state }) {
  const id = state.get('editor.currentId');

  return api
    .patch(`/sandboxes/${id}/privacy`, {
      sandbox: {
        privacy: props.privacy,
      },
    })
    .then(() => undefined);
}

export function updateFrozen({ api, props, state }) {
  const id = state.get('editor.currentId');

  return api
    .put(`/sandboxes/${id}`, {
      sandbox: {
        is_frozen: props.frozen,
      },
    })
    .then(() => state.set('editor.currentSandbox.isFrozen', props.frozen));
}

export function restartSandbox() {
  dispatch({ type: 'socket:message', channel: 'sandbox:restart' });
}

export function fetchEnvironmentVariables({ state, api, path }) {
  const id = state.get('editor.currentId');

  return api
    .get(`/sandboxes/${id}/env`, {}, { shouldCamelize: false })
    .then(data => {
      state.set('editor.currentSandbox.environmentVariables', data);
      return path.success(data);
    });
}

export function deleteEnvironmentVariable({ state, props, api, path }) {
  const id = state.get('editor.currentId');
  return api
    .delete(`/sandboxes/${id}/env/${props.name}`, {}, { shouldCamelize: false })
    .then(data => {
      state.set('editor.currentSandbox.environmentVariables', data);
      return path.success(data);
    });
}

export function updateEnvironmentVariables({ state, props, api, path }) {
  const id = state.get('editor.currentId');

  return api
    .post(
      `/sandboxes/${id}/env`,
      {
        environment_variable: {
          name: props.name,
          value: props.value,
        },
      },
      {
        shouldCamelize: false,
      }
    )
    .then(data => {
      state.set('editor.currentSandbox.environmentVariables', data);
      return path.success(data);
    });
}

export function forceRender({ state }) {
  state.set('editor.forceRender', state.get('editor.forceRender') + 1);
}

export function outputModuleIdFromActionPath({ state, props, utils }) {
  const sandbox = state.get('editor.currentSandbox');
  const module = utils.resolveModule(
    props.action.path.replace(/^\//, ''),
    sandbox.modules,
    sandbox.directories
  );

  return { id: module ? module.id : null };
}

export function consumeRenameModuleFromPreview({ state, props, utils }) {
  const sandbox = state.get('editor.currentSandbox');
  const module = utils.resolveModule(
    props.action.path.replace(/^\//, ''),
    sandbox.modules,
    sandbox.directories
  );

  if (module) {
    return {
      moduleShortid: module.shortid,
      title: props.action.title,
    };
  }
  return {};
}

export function addErrorFromPreview({ state, props, utils }) {
  const sandbox = state.get('editor.currentSandbox');

  try {
    let module = null;

    if (props.action.path) {
      module = utils.resolveModule(
        props.action.path.replace(/^\//, ''),
        sandbox.modules,
        sandbox.directories
      );
    }

    const error = {
      moduleId: module ? module.id : undefined,
      column: props.action.column,
      line: props.action.line,
      message: props.action.message,
      title: props.action.title,
    };

    state.push('editor.errors', error);
  } catch (e) {
    /* ignore, module not found */
  }
}

export function addGlyphFromPreview({ state, props, utils }) {
  const sandbox = state.get('editor.currentSandbox');
  const module = utils.resolveModule(
    props.action.path.replace(/^\//, ''),
    sandbox.modules,
    sandbox.directories
  );
  const glyph = {
    moduleId: module.id,
    line: props.action.line,
    className: props.action.className,
  };

  if (module) {
    state.push('editor.glyphs', glyph);
  }
}

export function addCorrectionFromPreview({ state, props, utils }) {
  const sandbox = state.get('editor.currentSandbox');

  let module = null;

  if (props.action.path) {
    module = utils.resolveModule(
      props.action.path.replace(/^\//, ''),
      sandbox.modules,
      sandbox.directories
    );
  }
  const correction = {
    moduleId: module ? module.id : undefined,
    column: props.action.column,
    line: props.action.line,
    message: props.action.message,
    source: props.action.source,
    severity: props.action.severity,
  };

  state.push('editor.corrections', correction);
}

export function moveTab({ state, props }) {
  const tabs = state.get('editor.tabs');
  const tab = clone(tabs[props.prevIndex]);

  state.splice('editor.tabs', props.prevIndex, 1);
  state.splice('editor.tabs', props.nextIndex, 0, tab);
}

export function unsetDirtyTab({ state }) {
  const currentModule = state.get('editor.currentModule');
  const tabs = state.get('editor.tabs');
  const tabIndex = tabs.findIndex(
    tab => tab.moduleShortid === currentModule.shortid
  );

  if (tabIndex !== -1) {
    state.set(`editor.tabs.${tabIndex}.dirty`, false);
  }
}

export function outputChangedModules({ state }) {
  const changedModuleShortids = state.get('editor.changedModuleShortids');
  const sandbox = state.get('editor.currentSandbox');

  return {
    changedModules: sandbox.modules.filter(
      module => changedModuleShortids.indexOf(module.shortid) >= 0
    ),
  };
}

export function confirmForkingOwnSandbox({ browser, path }) {
  return browser.confirm('Do you want to fork your own sandbox?')
    ? path.confirmed()
    : path.cancelled();
}

export function unlikeSandbox({ api, props }) {
  return api.request({
    method: 'DELETE',
    url: `/sandboxes/${props.id}/likes`,
    body: {
      id: props.id,
    },
  });
}

export function likeSandbox({ api, props }) {
  return api.post(`/sandboxes/${props.id}/likes`, {
    id: props.id,
  });
}

export function createZip({ utils, state }) {
  const sandbox = state.get('editor.currentSandbox');

  utils.zipSandbox(sandbox);
}

export function addChangedModule({ state, props }) {
  const moduleShortid =
    props.moduleShortid || state.get('editor.currentModuleShortid');

  const module = state
    .get('editor.currentSandbox.modules')
    .find(m => m.shortid === moduleShortid);

  if (module) {
    const moduleIndex = state
      .get('editor.changedModuleShortids')
      .indexOf(moduleShortid);

    if (moduleIndex === -1) {
      if (module.savedCode !== module.code) {
        state.push('editor.changedModuleShortids', moduleShortid);
      }
    } else if (module.savedCode === module.code) {
      state.set(
        'editor.changedModuleShortids',
        state
          .get('editor.changedModuleShortids')
          .filter(x => x !== moduleShortid)
      );
    }
  }
}

export function saveChangedModules({ props, api, state, recover }) {
  const sandboxId = state.get('editor.currentId');

  return api
    .put(`/sandboxes/${sandboxId}/modules/mupdate`, {
      modules: props.changedModules,
    })
    .then(() => {
      recover.clearSandbox(sandboxId);
      return undefined;
    });
}

export function removeChangedModules({ props, state }) {
  props.changedModules.forEach(module => {
    const sandbox = state.get('editor.currentSandbox');
    const index = sandbox.modules.findIndex(m => m.id === module.id);

    if (index !== -1) {
      const currentCode = state.get(
        `editor.sandboxes.${sandbox.id}.modules.${index}.code`
      );
      // If the code hasn't change between the save call and this action we can just reset
      // the saved code. Otherwise we must set the savedCode to the value of the last save.
      if (currentCode === module.code) {
        state.set(
          `editor.sandboxes.${sandbox.id}.modules.${index}.savedCode`,
          undefined
        );
      } else {
        state.set(
          `editor.sandboxes.${sandbox.id}.modules.${index}.savedCode`,
          module.code
        );
      }
    }
  });

  state.set(
    'editor.changedModuleShortids',
    state
      .get('editor.changedModuleShortids')
      .filter(shortid => !props.changedModules.find(m => m.shortid === shortid))
  );
}

export function prettifyCode({ utils, state, props, path }) {
  const sandbox = state.get('editor.currentSandbox');
  const moduleToPrettify = sandbox.modules.find(
    module => module.shortid === props.moduleShortid
  );
  let config = state.get('preferences.settings.prettierConfig');
  const configFromSandbox = sandbox.modules.find(
    module => module.directoryShortid == null && module.title === '.prettierrc'
  );

  if (configFromSandbox) {
    try {
      config = JSON.parse(configFromSandbox.code);
    } catch (e) {
      return path.invalidPrettierSandboxConfig();
    }
  }

  return utils
    .prettify(
      moduleToPrettify.title,
      () => (moduleToPrettify ? moduleToPrettify.code : ''),
      config,
      () =>
        moduleToPrettify
          ? moduleToPrettify.id === state.get(`editor.currentModule.id`)
          : false
    )
    .then(newCode => path.success({ code: newCode }))
    .catch(error => path.error({ error }));
}

export function updateTemplateIfSSE({ state, api }) {
  try {
    const currentTemplate = state.get('editor.currentSandbox.template');
    const templateDefinition = getTemplate(currentTemplate);

    const shouldUpdateTemplate = (() => {
      // We always want to be able to update server template based on its detection.
      // We only want to update the client template when it's explicitly specified
      // in the sandbox configuration.

      if (templateDefinition.isServer) {
        return true;
      }

      const sandboxConfig = state.get('editor.parsedConfigurations.sandbox');

      if (sandboxConfig.parsed.template) {
        return true;
      }

      return false;
    })();

    if (shouldUpdateTemplate) {
      const { parsed } = state.get('editor.parsedConfigurations.package');

      const modulesByPath = mapValues(state.get('editor.modulesByPath'), m => ({
        content: m.code,
        isBinary: m.isBinary,
      }));

      const newTemplate = computeTemplate(parsed, modulesByPath) || 'node';

      if (
        newTemplate !== currentTemplate &&
        templateDefinition.isServer === getTemplate(newTemplate).isServer
      ) {
        state.set('editor.currentSandbox.template', newTemplate);
        api.put(`/sandboxes/${state.get('editor.currentSandbox.id')}/`, {
          sandbox: { template: newTemplate },
        });
      }
    }
  } catch (e) {
    // We don't want this to be blocking at all, it's low prio
    if (process.env.NODE_ENV === 'development') {
      console.error(e);
    }
  }
}

export function saveModuleCode({ props, state, api, recover, path }) {
  const sandbox = state.get('editor.currentSandbox');
  const moduleToSave = sandbox.modules.find(
    module => module.shortid === props.moduleShortid
  );

  const codeToSave = moduleToSave.code;
  const title = moduleToSave.title;

  return api
    .put(`/sandboxes/${sandbox.id}/modules/${moduleToSave.shortid}`, {
      module: { code: codeToSave },
    })
    .then(x => {
      const newSandbox = state.get('editor.currentSandbox');
      const newModuleToSave = sandbox.modules.find(
        module => module.shortid === props.moduleShortid
      );

      const index = newSandbox.modules.findIndex(
        m => m.id === newModuleToSave.id
      );

      if (index > -1) {
        state.set(
          `editor.sandboxes.${newSandbox.id}.modules.${index}.insertedAt`,
          x.insertedAt
        );
        state.set(
          `editor.sandboxes.${newSandbox.id}.modules.${index}.updatedAt`,
          x.updatedAt
        );
        if (newModuleToSave.code === codeToSave) {
          state.set(
            `editor.sandboxes.${newSandbox.id}.modules.${index}.savedCode`,
            undefined
          );
          recover.remove(sandbox.id, moduleToSave);
        } else {
          state.set(
            `editor.sandboxes.${newSandbox.id}.modules.${index}.savedCode`,
            x.code
          );

          return path.codeOutdated({
            message: `The code of '${title}' changed while saving. Please try again with saving.`,
          });
        }
      }

      return path.success(x);
    })
    .catch(e =>
      path.error({
        message: e.message,
      })
    );
}

export function getCurrentModuleId({ state }) {
  const currentModuleShortid = state.get('editor.currentModuleShortid');
  const sandbox = state.get('editor.currentSandbox');

  return {
    moduleId: sandbox.modules.find(
      module => module.shortid === currentModuleShortid
    ).id,
  };
}

export function warnUnloadingContent({ browser, state }) {
  browser.onUnload(event => {
    if (!state.get('editor.isAllModulesSynced')) {
      const returnMessage =
        'You have not saved all your modules, are you sure you want to close this tab?';

      event.returnValue = returnMessage; // eslint-disable-line

      return returnMessage;
    }

    return null;
  });
}

export function setCode({ props, state, recover }) {
  const currentId = state.get('editor.currentId');
  const currentSandbox = state.get('editor.currentSandbox');
  const moduleShortid = props.moduleShortid;
  const moduleIndex = state
    .get('editor.currentSandbox')
    .modules.findIndex(module => module.shortid === moduleShortid);
  const module = currentSandbox.modules[moduleIndex];

  if (module) {
    if (!module.savedCode) {
      state.set(
        `editor.sandboxes.${currentId}.modules.${moduleIndex}.savedCode`,
        module.code
      );
    }

    if (currentSandbox.owned) {
      const savedCode = state.get(
        `editor.sandboxes.${currentId}.modules.${moduleIndex}.savedCode`,
        module.code
      );

      // Save the code to localStorage so we can recover in case of a crash
      recover.save(
        currentId,
        currentSandbox.version,
        module,
        props.code,
        savedCode
      );
    }

    state.set(
      `editor.sandboxes.${currentId}.modules.${moduleIndex}.code`,
      props.code
    );
  }
}

export function getSavedCode({ props, state }) {
  const sandbox = state.get('editor.currentSandbox');
  const moduleIndex = sandbox.modules.findIndex(
    m => m.shortid === props.moduleShortid
  );

  if (moduleIndex > -1) {
    const module = state.get(`editor.currentSandbox.modules.${moduleIndex}`);

    if (module.savedCode) {
      return { oldCode: module.code, code: module.savedCode };
    }

    return { oldCode: module.code, code: module.code };
  }

  return {};
}

export function touchFile({ props, state }) {
  const sandbox = state.get('editor.currentSandbox');
  const moduleIndex = sandbox.modules.findIndex(
    m => m.shortid === props.moduleShortid
  );

  if (moduleIndex > -1) {
    state.set(
      `editor.currentSandbox.modules.${moduleIndex}.updatedAt`,
      new Date().toString()
    );
  }

  return {};
}
