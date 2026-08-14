import { Test, TestingModule } from '@nestjs/testing';
import { FileSecurityService } from './file-security/file-security.service';

describe('FileSecurityService', () => {
  let service: FileSecurityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FileSecurityService],
    }).compile();

    service = module.get<FileSecurityService>(FileSecurityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
