import type { Sandbox, Module, Directory } from 'common/lib/types';

import files from 'buffer-loader!./files.zip'; // eslint-disable-line import/no-webpack-loader-syntax
import { createFile, createDirectoryWithFiles } from '../';

export default function createZip(
  zip,
  sandbox: Sandbox,
  modules: Array<Module>,
  directories: Array<Directory>
) {
  return zip.loadAsync(files).then(async src => {
    await Promise.all(
      modules
        .filter(x => x.directoryShortid == null)
        .filter(x => x.title !== 'yarn.lock' && x.title !== 'package-lock.json')
        .map(x => createFile(x, src))
    );

    await Promise.all(
      directories
        .filter(x => x.directoryShortid == null)
        .map(x => createDirectoryWithFiles(modules, directories, x, src))
    );
  });
}
