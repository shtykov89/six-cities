import { Request, Response } from 'express';
import { inject, injectable } from 'inversify';
import { Controller } from '../../core/controller/controller.abstract.js';
import { LoggerInterface } from '../../core/logger/logger.interface.js';
import { AppComponent } from '../../types/app-component.enum.js';
import { HttpMethod } from '../../types/http-method.enum.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UserServiceInterface } from './user-service.interface.js';
import { ConfigInterface } from '../../core/config/config.interface.js';
import { RestSchema } from '../../core/config/rest.schema.js';
import { HttpError } from '../../core/errors/http-error.js';
import { StatusCodes } from 'http-status-codes';
import { fillDTO } from '../../core/helpers/index.js';
import { UserRdo } from './rdo/user.rdo.js';
import { LoginUserDto } from './dto/login-user.dto.js';
import { ValidateDtoMiddleware } from '../../core/middleware/validate-dto.middleware.js';
import { ValidateObjectIdMiddleware } from '../../core/middleware/validate-objectid.middleware.js';
import { UploadFileMiddleware } from '../../core/middleware/upload-file.middleware.js';
import { createJWT } from '../../core/helpers/index.js';
import { LoggedUserRdo } from './rdo/logged-user.rdo.js';
import { JWT_ALGORITHM } from './user.constant.js';

@injectable()
export class UserController extends Controller {
  constructor(
    @inject(AppComponent.LoggerInterface) protected readonly logger: LoggerInterface,
    @inject(AppComponent.UserServiceInterface) private readonly userService: UserServiceInterface,
    @inject(AppComponent.ConfigInterface) private readonly configService: ConfigInterface<RestSchema>,
  ) {
    super(logger);
    this.logger.info('Register routes for UserController…');

    this.addRoute({
      path: '/register',
      method: HttpMethod.Post,
      handler: this.create,
      middlewares: [new ValidateDtoMiddleware(CreateUserDto)],
    });
    this.addRoute({
      path: '/login',
      method: HttpMethod.Post,
      handler: this.login,
      middlewares: [new ValidateDtoMiddleware(LoginUserDto)],
    });
    this.addRoute({
      path: '/:userId/avatar',
      method: HttpMethod.Post,
      handler: this.uploadAvatar,
      middlewares: [
        new ValidateObjectIdMiddleware('userId'),
        new UploadFileMiddleware(this.configService.get('UPLOAD_DIRECTORY'), 'avatar'),
      ],
    });
    this.addRoute({
      path: '/login',
      method: HttpMethod.Get,
      handler: this.checkAuthenticate,
    });
  }

  public async create(
    { body }: Request<Record<string, unknown>, Record<string, unknown>, CreateUserDto>,
    res: Response,
  ): Promise<void> {
    const existsUser = await this.userService.findByEmail(body.email);

    if (existsUser) {
      throw new HttpError(StatusCodes.CONFLICT, `User with email «${body.email}» exists.`, 'UserController');
    }

    const result = await this.userService.create(body, this.configService.get('SALT'));
    this.created(res, fillDTO(UserRdo, result));
  }

  public async login(
    { body }: Request<Record<string, unknown>, Record<string, unknown>, LoginUserDto>,
    res: Response,
  ): Promise<void> {
    const user = await this.userService.verifyUser(body, this.configService.get('SALT'));

    if (!user) {
      throw new HttpError(StatusCodes.UNAUTHORIZED, 'Unauthorized', 'UserController');
    }

    const token = await createJWT(JWT_ALGORITHM, this.configService.get('JWT_SECRET'), {
      email: user.email,
      id: user.id,
    });

    this.ok(
      res,
      fillDTO(LoggedUserRdo, {
        email: user.email,
        token,
      }),
    );
  }

  public async uploadAvatar(req: Request, res: Response) {
    await this.created(res, {
      filepath: req.file?.path,
    });
  }

  public async checkAuthenticate({ user }: Request, res: Response) {
    const foundedUser = await this.userService.findByEmail(user.email);

    if (!foundedUser) {
      throw new HttpError(StatusCodes.UNAUTHORIZED, 'Unauthorized', 'UserController');
    }

    this.ok(res, fillDTO(LoggedUserRdo, foundedUser));
  }
}
